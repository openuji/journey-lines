import type { CdpTransport, Unsubscribe } from './transport.js';

/** CSS viewport size, in pixels. */
export type Viewport = Readonly<{
  width: number;
  height: number;
}>;

/**
 * A page being recorded, as handed out by a host.
 *
 * The host creates the transport and is the only code that ends it, through
 * `close()`. What closing means is the host's business: a launched browser is
 * shut down, an extension merely detaches its debugger from a tab the user
 * keeps.
 */
export interface RecordingTarget {
  readonly cdp: CdpTransport;
  /**
   * Known when the host controls the viewport (a launched browser), absent when
   * it does not (an attached tab) — the compositor then asks CDP instead.
   */
  readonly viewport?: Viewport;
  /** Resolves once the navigation has committed. */
  navigate(url: string): Promise<void>;
  /** Fires once if the target goes away on its own: browser closed, tab closed, debugger detached. */
  onClosed(listener: () => void): Unsubscribe;
  close(): Promise<void>;
}

/** How a tab's session ended on its own. */
export type SessionEnd =
  /** The person withdrew permission to record (the extension's Cancel). */
  | 'revoked'
  /** Anything else: the tab closed, or the host lost the page (Chrome's PDF viewer). */
  | 'lost';

/** A recording session on one tab, as a `TabHost` hands it out. */
export interface TabSession {
  readonly cdp: CdpTransport;
  /** Fires once if the session ends on its own. */
  onClosed(listener: (end: SessionEnd) => void): Unsubscribe;
  /** Hand the tab back as it was found. Does nothing once the session has ended. */
  close(): Promise<void>;
}

/**
 * A browser's tabs, as a recording that follows the active one needs them.
 * Each host knows the active tab its own way; `recordActiveTab` is the one
 * place that decides what to record.
 */
export interface TabHost<Tab> {
  /**
   * The active tab: when another becomes active, and again when it may have
   * become recordable (it committed a new page). Reports may repeat.
   */
  onActive(listener: (tab: Tab) => void): Unsubscribe;
  /** Fires once when nothing is left to follow: the window or browser is gone. */
  onGone(listener: () => void): Unsubscribe;
  /**
   * A session on `tab`, scale factor pinned. May take as long as the tab's
   * page takes to commit; rejects when the tab can't be recorded.
   */
  attach(tab: Tab): Promise<TabSession>;
}
