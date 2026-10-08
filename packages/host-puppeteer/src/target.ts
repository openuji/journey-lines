import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  navigateUntilClosed,
  type RecordingTarget,
  type Unsubscribe,
  type Viewport,
} from '@openuji/cdp';
import { puppeteerTabs, type PuppeteerTabs } from './tabs.js';
import { createPuppeteerTransport } from './transport.js';

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };

export type WaitUntil = 'commit' | 'domcontentloaded' | 'load';

export interface PuppeteerTargetOptions {
  /**
   * Headless runs `chrome-headless-shell`, not full Chrome's headless mode: the
   * latter reports every screencast frame at scroll offset 0 (seen on Chrome
   * 154). Defaults to headless.
   */
  readonly headless?: boolean;
  /**
   * Headless: the viewport the page is emulated at, fixed for the session.
   * Headed: the size the window's content area opens at. The page then lays
   * out to its real window and reflows when the user resizes it, as any tab
   * does, so the target reports no viewport and the compositor reads it from
   * CDP.
   */
  readonly viewport?: Viewport;
  /**
   * Chrome to launch. Omit for the Chrome for Testing build this Puppeteer
   * release is pinned to — the supported pairing. Set it to run against another
   * Chrome, as the compatibility suite does across majors; together with
   * `headless` it must be a `chrome-headless-shell` binary.
   */
  readonly executablePath?: string;
}

/**
 * A freshly launched Chrome with its own throwaway profile, whose tabs a
 * recording can follow (`recordActiveTab(browser.tabs, browser.firstTab, …)`).
 */
export interface PuppeteerBrowser {
  readonly browser: Browser;
  /** Its tabs; a tab is Chrome's target id. */
  readonly tabs: PuppeteerTabs;
  /** The tab it opened with. */
  readonly firstTab: string;
  /** Headless: the viewport every page is laid out at. Absent headed. */
  readonly viewport?: Viewport;
  /** Navigate the first tab; resolves once the new document has committed. */
  navigate(url: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * A page in a freshly launched Chrome with its own throwaway profile.
 *
 * `browser` and `page` stay reachable for Puppeteer-specific callers (driving
 * the page in a script, say); nothing in the recording pipeline touches them.
 */
export interface PuppeteerTarget extends RecordingTarget {
  readonly browser: Browser;
  readonly page: Page;
  /** `waitUntil` defaults to `'commit'`, the `RecordingTarget` contract. */
  navigate(url: string, options?: { waitUntil?: WaitUntil }): Promise<void>;
}

export async function launchPuppeteerBrowser(
  options: PuppeteerTargetOptions = {},
): Promise<PuppeteerBrowser> {
  return (await launch(options)).chrome;
}

/** The browser, and the Puppeteer page of the tab it opened with. */
async function launch(options: PuppeteerTargetOptions): Promise<{ chrome: PuppeteerBrowser; page: Page }> {
  const headless = options.headless !== false;
  const viewport = { ...(options.viewport ?? DEFAULT_VIEWPORT) };

  const browser = await puppeteer.launch({
    headless: headless ? 'shell' : false,
    ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    // Headed, a fixed viewport would pin the layout at `viewport` no matter how
    // big the window really is: a smaller window clips the page and resizing
    // never reflows it.
    defaultViewport: headless ? viewport : null,
    // Puppeteer installs its own SIGINT/SIGTERM handlers that close the browser
    // and exit the process. That races our teardown and can cut the session
    // short before the final capture is flushed, so we take over signal
    // handling entirely.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });

  try {
    // Every launch gets a fresh temporary profile, so the default context is
    // already isolated; reusing its first tab avoids a stray blank window.
    const page = (await browser.pages())[0] ?? (await browser.newPage());
    if (!headless) {
      // Sizes the content area, not the window, so the toolbar does not eat
      // into it. The OS may still clamp it to fit the screen. The layout then
      // follows the real window; only the scale factor is pinned, per tab.
      await page.resize({
        contentWidth: viewport.width,
        contentHeight: viewport.height,
      });
    }

    const tabs = await puppeteerTabs(browser, headless ? viewport : undefined);
    const chrome: PuppeteerBrowser = {
      browser,
      tabs,
      firstTab: await targetIdOf(page),
      ...(headless ? { viewport } : {}),
      navigate: (url) => navigateCommitted(page, url, tabs.onGone),
      close: () => browser.close().catch(() => {}),
    };
    return { chrome, page };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

/**
 * The browser of `launchPuppeteerBrowser`, recording its first tab only: the
 * shape the stream runners and the conformance suite drive.
 */
export async function launchPuppeteerTarget(
  options: PuppeteerTargetOptions = {},
): Promise<PuppeteerTarget> {
  const { chrome, page } = await launch(options);

  try {
    const session = await chrome.tabs.attach(chrome.firstTab);

    return {
      cdp: session.cdp,
      ...(chrome.viewport ? { viewport: chrome.viewport } : {}),
      browser: chrome.browser,
      page,

      async navigate(url, navigateOptions = {}) {
        const waitUntil = navigateOptions.waitUntil ?? 'commit';
        if (waitUntil !== 'commit') {
          await page.goto(url, { waitUntil });
          return;
        }

        // `page.goto` cannot stop at commit, and on a slow page its timeout
        // would fail a recording that is going fine.
        await navigateUntilClosed(session.cdp, url, session.onClosed);
      },

      // The page closing or the browser going away.
      onClosed: session.onClosed,

      close: () => chrome.close(),
    };
  } catch (err) {
    await chrome.close();
    throw err;
  }
}

/** Chrome's id for `page`'s tab. */
async function targetIdOf(page: Page): Promise<string> {
  const session = await page.createCDPSession();
  try {
    return (await session.send('Target.getTargetInfo')).targetInfo.targetId;
  } finally {
    await session.detach().catch(() => {});
  }
}

/** Navigate `page` to `url` over a session of its own, until it commits or the browser is gone. */
async function navigateCommitted(
  page: Page,
  url: string,
  onGone: (listener: () => void) => Unsubscribe,
): Promise<void> {
  const session = await page.createCDPSession();
  const cdp = createPuppeteerTransport(session);
  try {
    await navigateUntilClosed(cdp, url, onGone);
  } finally {
    cdp.dispose();
    await session.detach().catch(() => {});
  }
}
