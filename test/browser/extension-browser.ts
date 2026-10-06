import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer';

/** The production build `pnpm build:extension` writes. */
const EXTENSION = fileURLToPath(
  new URL('../../apps/extension/.output/chrome-mv3', import.meta.url),
);

export interface ExtensionBrowser {
  readonly browser: Browser;
  /** The extension's service worker, where `globalThis.recorder` lives. */
  readonly worker: WebWorker;
  /** Open the side panel's page in a background tab; a real side panel needs a user gesture. */
  openPanel(): Promise<Page>;
  close(): Promise<void>;
}

/**
 * Chrome for Testing, headed, with the built extension installed.
 *
 * Puppeteer attaches to the extension's own pages and worker only, never to a
 * web page: a recorded tab then has exactly one CDP client — the extension's
 * `chrome.debugger` — as in a person's own Chrome. (Attaching would not fail:
 * on Chrome 154 `chrome.debugger.attach` succeeds next to Puppeteer's session.)
 * Web pages are opened, driven and closed through the worker instead.
 */
export async function launchWithExtension(
  options: { executablePath?: string | undefined; args?: string[] } = {},
): Promise<ExtensionBrowser> {
  const browser = await puppeteer.launch({
    headless: false,
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    args: options.args ?? [],
    defaultViewport: null,
    enableExtensions: [EXTENSION],
    // The first tab is a web page too, so there is none to wait for.
    waitForInitialPage: false,
    targetFilter: (target) =>
      target.type() !== 'page' || target.url().startsWith('chrome-extension://'),
  });

  try {
    const workerTarget = await browser.waitForTarget(
      (target) =>
        target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
    );
    const worker = await workerTarget.worker();
    if (!worker) throw new Error('The extension service worker did not start');

    return {
      browser,
      worker,

      async openPanel() {
        const url = await worker.evaluate(async () => {
          const panelUrl = chrome.runtime.getURL('sidepanel.html');
          // In the background, so the recorded tab stays in front and keeps
          // producing frames.
          await chrome.tabs.create({ url: panelUrl, active: false });
          return panelUrl;
        });
        const page = await (await browser.waitForTarget((t) => t.url() === url)).page();
        if (!page) throw new Error('The panel page did not open');
        return page;
      },

      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
