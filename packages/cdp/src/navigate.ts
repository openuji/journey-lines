import type { CdpTransport, Unsubscribe } from './transport.js';

/**
 * Navigate the top frame and resolve once the new document has committed,
 * which Chromium reports with `Page.frameNavigated`. The reply to
 * `Page.navigate` alone only says the navigation was accepted.
 *
 * Chrome answers once the response headers arrive, and reports every
 * navigation that leaves no new document as an error: 204/205, a download,
 * one superseded by a newer navigation. What can keep it waiting comes before
 * that answer: a server that never responds, or an unanswered `beforeunload`
 * dialog.
 */
export async function navigateAndCommit(cdp: CdpTransport, url: string): Promise<void> {
  // Main-frame documents committed while we wait. Recorded from the start,
  // because CDP doesn't order the reply against the event: the commit can
  // land on either side of it.
  const committed = new Set<string>();
  let waiting: { loaderId: string; resolve: () => void } | undefined;

  // Subscribed *before* sending, so no commit event can slip past.
  const off = cdp.on('Page.frameNavigated', ({ frame }) => {
    if (frame.parentId) return; // subframes are not the navigation
    committed.add(frame.loaderId);
    if (frame.loaderId === waiting?.loaderId) waiting.resolve();
  });

  try {
    // Page events reach this session only once Page is enabled; idempotent.
    await cdp.send('Page.enable');

    const { loaderId, errorText } = await cdp.send('Page.navigate', { url });
    if (errorText) throw new Error(`Navigation to ${url} failed: ${errorText}`);

    // No new document to wait for: a same-document navigation (no loaderId),
    // or a commit that already arrived ahead of the reply.
    if (!loaderId || committed.has(loaderId)) return;

    // The executor runs synchronously, so `waiting` is set before any later
    // event can be dispatched.
    await new Promise<void>((resolve) => {
      waiting = { loaderId, resolve };
    });
  } finally {
    off();
  }
}

/**
 * `navigateAndCommit`, given up once the target goes away.
 *
 * There is deliberately no timeout: on a slow page one would fail a recording
 * that is going fine. The target closing is what ends a navigation that never
 * answers.
 */
export async function navigateUntilClosed(
  cdp: CdpTransport,
  url: string,
  onClosed: (listener: () => void) => Unsubscribe,
): Promise<void> {
  let stopWatching: Unsubscribe = () => {};
  const closed = new Promise<never>((_, reject) => {
    stopWatching = onClosed(() =>
      reject(new Error(`Target closed while navigating to ${url}`)),
    );
  });
  try {
    await Promise.race([navigateAndCommit(cdp, url), closed]);
  } finally {
    stopWatching();
  }
}
