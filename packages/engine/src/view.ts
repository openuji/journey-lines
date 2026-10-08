import type { DomainEvent, LifecycleEvent, ViewEntry, ViewState } from '@openuji/core';

/**
 * Views: the one place that knows the ways a view can begin.
 *
 * A document load, an SPA route change and switching to another tab mean the
 * same thing to the user — a next step. This module turns each into a new view;
 * everything downstream (the reducer's boundary, every rule, every sink) sees
 * only views, never what produced one.
 */

export type NavigatedEvent = Extract<LifecycleEvent, { type: 'navigated' }>;

/**
 * Decides whether a same-document URL change is a new route — a next step — or
 * only an update of the URL showing (filters in the query string, an anchor).
 */
export type RoutePolicy = (fromUrl: string, toUrl: string) => boolean;

/**
 * The default {@link RoutePolicy}: a route changes when the path does, or when
 * the fragment does and either side is a hash route (`#/…`, `#!/…`). Query-only
 * changes and plain anchor jumps keep the view.
 */
export const pathOrHashRoute: RoutePolicy = (fromUrl, toUrl) => {
  let from: URL;
  let to: URL;
  try {
    from = new URL(fromUrl);
    to = new URL(toUrl);
  } catch {
    return fromUrl !== toUrl;
  }

  if (from.origin !== to.origin || from.pathname !== to.pathname) return true;
  return from.hash !== to.hash && (isHashRoute(from.hash) || isHashRoute(to.hash));
};

function isHashRoute(hash: string): boolean {
  return hash.startsWith('#/') || hash.startsWith('#!/');
}

/** What a navigation does to the view showing. */
export type NavigationOutcome =
  | Readonly<{ kind: 'new-view'; entry: ViewEntry }>
  /** Same view, new URL. */
  | Readonly<{ kind: 'url-update' }>
  /** Not the main frame's, or nothing showing to update. */
  | null;

/** The main frame showing a document: a load, or the one a new session finds showing. */
export function isDocumentReport(event: DomainEvent): event is NavigatedEvent {
  return event.type === 'navigated' && event.isMainFrame && !event.sameDocument;
}

/**
 * Pure. `otherTab`: the recording has just moved to another tab, so the
 * document it reports starts a `tab` view — even the one the current view
 * shows, when you came back to it.
 */
export function classifyNavigation(
  current: ViewState | null,
  event: NavigatedEvent,
  routePolicy: RoutePolicy,
  otherTab = false,
): NavigationOutcome {
  if (!event.isMainFrame) return null;
  if (otherTab && isDocumentReport(event)) return { kind: 'new-view', entry: 'tab' };

  if (event.sameDocument) {
    if (!current) return null;
    return routePolicy(current.url, event.url)
      ? { kind: 'new-view', entry: 'route' }
      : { kind: 'url-update' };
  }

  // A commit under the loader already showing (a redirect, or the document the
  // source reported at attach committing again) is the same document.
  return current?.loaderId === event.loaderId
    ? { kind: 'url-update' }
    : { kind: 'new-view', entry: 'load' };
}

/** The ids handed out so far. */
export type ViewCounts = Readonly<{ views: number; documents: number }>;

/**
 * The view a navigation starts. Pure.
 *
 * The only difference between the entries: a load or a tab starts from
 * nothing, while a route keeps its document — the frames already seen, because
 * the compositor never stopped painting it, and where the page last said it was.
 */
export function enterView(
  current: ViewState | null,
  event: NavigatedEvent,
  entry: ViewEntry,
  counts: ViewCounts,
): ViewState {
  const id = counts.views + 1;

  if (entry === 'route' && current) {
    return { ...current, id, url: event.url, entry };
  }

  return {
    id,
    documentId: counts.documents + 1,
    loaderId: event.loaderId,
    url: event.url,
    entry,
    firstFrameObserved: false,
    lastFrame: null,
    position: null,
  };
}
