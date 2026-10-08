import type { Browser, CDPSession, Protocol } from 'puppeteer';
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
 * Runs in every page the watcher sees: a page that shows says so, when it
 * loads in the active tab and when its tab becomes the active one.
 */
const ACTIVE_SOURCE = `(() => {
  const tell = () => document.visibilityState === 'visible' && ${ACTIVE_BINDING}('');
  tell();
  addEventListener('visibilitychange', tell, true);
})();`;

/** A launched browser's tabs. A tab is Chrome's target id, as the extension's is Chrome's tab id. */
export interface PuppeteerTabs extends TabHost<string> {
  /** The URL Chrome last reported for `tab`; empty once it is closed. */
  urlOf(tab: string): string;
}

/** The page targets that exist, by target id, and what Chrome last said about each. */
interface Pages {
  readonly infos: ReadonlyMap<string, Protocol.Target.TargetInfo>;
  onCreated(listener: (targetId: string) => void): Unsubscribe;
  /** A page target went away: its tab closed, or the browser is going. */
  onDestroyed(listener: (targetId: string) => void): Unsubscribe;
  /** A new session on the page; rejects once it is closed. */
  attach(targetId: string): Promise<CDPSession>;
}

/**
 * The pages as Chrome reports them over a browser-level session of our own:
 * the one source for which tabs exist and which closed. Puppeteer's own
 * `targetdestroyed` can't be that source; it fires for a tab that only
 * navigated (the first tab, leaving about:blank).
 */
async function watchPages(browser: Browser): Promise<Pages> {
  const root = await browser.target().createCDPSession();
  const connection = root.connection();
  if (!connection) throw new Error('No CDP connection to the browser');

  const infos = new Map<string, Protocol.Target.TargetInfo>();
  const created = new Set<(targetId: string) => void>();
  const destroyed = new Set<(targetId: string) => void>();
  root.on('Target.targetCreated', ({ targetInfo }) => {
    if (targetInfo.type !== 'page') return;
    infos.set(targetInfo.targetId, targetInfo);
    for (const listener of created) listener(targetInfo.targetId);
  });
  root.on('Target.targetInfoChanged', ({ targetInfo }) => {
    if (infos.has(targetInfo.targetId)) infos.set(targetInfo.targetId, targetInfo);
  });
  root.on('Target.targetDestroyed', ({ targetId }) => {
    if (!infos.delete(targetId)) return;
    for (const listener of destroyed) listener(targetId);
  });
  // Reports every target that exists already, then each new one.
  await root.send('Target.setDiscoverTargets', { discover: true });

  return {
    infos,
    onCreated(listener) {
      created.add(listener);
      return () => created.delete(listener);
    },
    onDestroyed(listener) {
      destroyed.add(listener);
      return () => destroyed.delete(listener);
    },
    async attach(targetId) {
      const info = infos.get(targetId);
      if (!info) throw new Error(`Tab ${targetId} is closed`);
      // Puppeteer's own attach to a target, so the session's `detach()` works.
      return connection.createSession(info);
    },
  };
}

/**
 * The tabs of a launched browser, as `recordActiveTab` follows them.
 *
 * CDP has no event for the active tab, so the first `onActive` subscriber
 * starts a watcher in every page: the page that becomes visible is the active
 * one. Headed, that is Chrome's own choice. headless-shell shows every page,
 * so there a tab counts as active when it loads a page.
 *
 * `viewport`: headless, the size every page is laid out at.
 */
export async function puppeteerTabs(browser: Browser, viewport?: Viewport): Promise<PuppeteerTabs> {
  const pages = await watchPages(browser);
  const activeListeners = new Set<(tab: string) => void>();
  let watching = false;

  const watch = async (targetId: string): Promise<void> => {
    const session = await pages.attach(targetId).catch(() => null);
    if (!session) return;
    session.on('Runtime.bindingCalled', ({ name }) => {
      if (name !== ACTIVE_BINDING) return;
      for (const listener of activeListeners) listener(targetId);
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
    pages.onCreated((targetId) => void watch(targetId));
    for (const targetId of pages.infos.keys()) void watch(targetId);
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
      const stopPages = pages.onDestroyed(() => {
        if (pages.infos.size === 0) once();
      });
      browser.on('disconnected', once);
      return () => {
        stopPages();
        browser.off('disconnected', once);
      };
    },

    async attach(targetId) {
      const session = await pages.attach(targetId);
      const cdp = createPuppeteerTransport(session);
      try {
        await pinScaleFactor(cdp, viewport);
      } catch (error) {
        cdp.dispose();
        await session.detach().catch(() => {});
        throw error;
      }
      return tabSession(browser, pages, targetId, session, cdp);
    },

    urlOf: (tab) => pages.infos.get(tab)?.url ?? '',
  };
}

/** One recording session on a page; it ends with the page or the browser. */
function tabSession(
  browser: Browser,
  pages: Pages,
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
