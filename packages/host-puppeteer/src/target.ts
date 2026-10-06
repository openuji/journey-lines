import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  navigateUntilClosed,
  pinScaleFactor,
  type RecordingTarget,
  type Unsubscribe,
  type Viewport,
} from '@openuji/cdp';
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

export async function launchPuppeteerTarget(
  options: PuppeteerTargetOptions = {},
): Promise<PuppeteerTarget> {
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
    const cdp = createPuppeteerTransport(await page.createCDPSession());
    if (!headless) {
      // Sizes the content area, not the window, so the toolbar does not eat
      // into it. The OS may still clamp it to fit the screen.
      await page.resize({
        contentWidth: viewport.width,
        contentHeight: viewport.height,
      });
      // The layout follows the real window; only the scale factor is pinned.
      await pinScaleFactor(cdp);
    }

    const onClosed = (listener: () => void): Unsubscribe => {
      // Closing the last window does not end the browser everywhere (macOS
      // keeps it running), so a closed tab counts as the target going away.
      let fired = false;
      const once = (): void => {
        if (fired) return;
        fired = true;
        listener();
      };

      browser.on('disconnected', once);
      page.on('close', once);
      return () => {
        browser.off('disconnected', once);
        page.off('close', once);
      };
    };

    return {
      cdp,
      ...(headless ? { viewport } : {}),
      browser,
      page,

      async navigate(url, navigateOptions = {}) {
        const waitUntil = navigateOptions.waitUntil ?? 'commit';
        if (waitUntil !== 'commit') {
          await page.goto(url, { waitUntil });
          return;
        }

        // `page.goto` cannot stop at commit, and on a slow page its timeout
        // would fail a recording that is going fine.
        await navigateUntilClosed(cdp, url, onClosed);
      },

      onClosed,

      async close() {
        cdp.dispose();
        await browser.close().catch(() => {});
      },
    };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}
