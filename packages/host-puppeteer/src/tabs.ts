import type { Browser, CDPSession, Target } from 'puppeteer';
import {
  clearScaleFactor,
  pinScaleFactor,
  type SessionEnd,
  type TabHost,
  type TabSession,
  type Unsubscribe,
  type Viewport,
} from '@openuji/cdp';
import { createPuppeteerTransport } from './transport.js';

/** The binding the active-tab watcher reports through, on its own sessions. */
const ACTIVE_BINDING = '__uxr_active__';

/**
 * Runs in every page the watcher sees: a page that shows says so — when it
 * loads in the active tab, and when its tab becomes the active one.
 */
const ACTIVE_SOURCE = `(() => {
  const tell = () => document.visibilityState === 'visible' && ${ACTIVE_BINDING}('');
  tell();
  addEventListener('visibilitychange', tell, true);
})();`;

/** The page targets that exist, by target id. */
interface PageTargets {
  readonly ids: ReadonlySet<string>;
  /** A page target went away: its tab closed, or the browser is going. */
  onDestroyed(listener: (targetId: string) => void): Unsubscribe;
}

/**
 * Page targets as the browser reports them over a session of our own.
 *
 * Puppeteer's `targetdestroyed` can't tell us: it fires for a tab that only
 * navigated (the first tab, leaving about:blank), and the tab goes on. CDP's
 * `Target.targetDestroyed` fires once, when the tab is really closed.
 */
async function watchPageTargets(browser: Browser): Promise<PageTargets> {
  const session = await browser.target().createCDPSession();
  const ids = new Set<string>();
  const listeners = new Set<(targetId: string) => void>();
  session.on('Target.targetCreated', ({ targetInfo }) => {
    if (targetInfo.type === 'page') ids.add(targetInfo.targetId);
  });
  session.on('Target.targetDestroyed', ({ targetId }) => {
    if (!ids.delete(targetId)) return;
    for (const listener of listeners) listener(targetId);
  });
  // Reports every target that exists already, then each new one.
  await session.send('Target.setDiscoverTargets', { discover: true });
  return {
    ids,
    onDestroyed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The tabs of a launched browser, as `recordActiveTab` follows them. A tab is
 * Puppeteer's own `Target`.
 *
 * CDP has no event for the active tab, so the first `onActive` subscriber
 * starts a watcher in every page: the page that becomes visible is the active
 * one. Headed, that is Chrome's own choice. headless-shell shows every page,
 * so there a tab counts as active when it loads a page.
 *
 * `viewport`: headless, the size every page is laid out at.
 */
export async function puppeteerTabs(
  browser: Browser,
  viewport?: Viewport,
): Promise<TabHost<Target>> {
  const pages = await watchPageTargets(browser);
  const activeListeners = new Set<(tab: Target) => void>();
  let watching = false;

  const watch = async (target: Target): Promise<void> => {
    if (target.type() !== 'page') return;
    const session = await target.createCDPSession().catch(() => null);
    if (!session) return;
    session.on('Runtime.bindingCalled', ({ name }) => {
      if (name !== ACTIVE_BINDING) return;
      for (const listener of activeListeners) listener(target);
    });
    // Best effort: a tab closing meanwhile simply stops reporting. Without
    // `Runtime.enable` the binding only reaches the documents that exist now.
    await session.send('Runtime.enable').catch(() => {});
    await session.send('Runtime.addBinding', { name: ACTIVE_BINDING }).catch(() => {});
    await session.send('Page.enable').catch(() => {});
    await session
      .send('Page.addScriptToEvaluateOnNewDocument', { source: ACTIVE_SOURCE })
      .catch(() => {});
    await session.send('Runtime.evaluate', { expression: ACTIVE_SOURCE }).catch(() => {});
  };

  const startWatching = (): void => {
    if (watching) return;
    watching = true;
    browser.on('targetcreated', (target: Target) => void watch(target));
    for (const target of browser.targets()) void watch(target);
  };

  return {
    onActive(listener) {
      activeListeners.add(listener);
      startWatching();
      return () => activeListeners.delete(listener);
    },

    onGone(listener) {
      // Closing the last window does not end the browser everywhere (macOS
      // keeps it running), so the last page closing counts as gone too.
      let fired = false;
      const once = (): void => {
        if (fired) return;
        fired = true;
        listener();
      };
      const lastPage = (): void => {
        if (pages.ids.size === 0) once();
      };
      const stopPages = pages.onDestroyed(lastPage);
      browser.on('disconnected', once);
      return () => {
        stopPages();
        browser.off('disconnected', once);
      };
    },

    async attach(target) {
      const session = await target.createCDPSession();
      const cdp = createPuppeteerTransport(session);
      try {
        const { targetInfo } = await session.send('Target.getTargetInfo');
        await pinScaleFactor(cdp, viewport);
        return tabSession(browser, pages, targetInfo.targetId, session, cdp);
      } catch (error) {
        cdp.dispose();
        await session.detach().catch(() => {});
        throw error;
      }
    },
  };
}

/** One recording session on a page target; it ends with the page or the browser. */
function tabSession(
  browser: Browser,
  pages: PageTargets,
  targetId: string,
  session: CDPSession,
  cdp: ReturnType<typeof createPuppeteerTransport>,
): TabSession {
  const closedListeners = new Set<(end: SessionEnd) => void>();
  let ended = false;

  const finish = (): void => {
    ended = true;
    cdp.dispose();
    stopPages();
    browser.off('disconnected', lost);
  };
  const lost = (): void => {
    if (ended) return;
    finish();
    for (const listener of closedListeners) listener('lost');
    closedListeners.clear();
  };
  const stopPages = pages.onDestroyed((destroyed) => {
    if (destroyed === targetId) lost();
  });
  browser.on('disconnected', lost);

  return {
    cdp,
    onClosed(listener): Unsubscribe {
      closedListeners.add(listener);
      return () => closedListeners.delete(listener);
    },
    async close() {
      if (ended) return;
      await clearScaleFactor(cdp).catch(() => {});
      finish();
      closedListeners.clear();
      await session.detach().catch(() => {});
    },
  };
}
