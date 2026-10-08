import type {
  CdpTransport,
  SessionEnd,
  TabHost,
  TabSession,
  Unsubscribe,
} from '@openuji/cdp';
import type { PushStreamStats } from '@openuji/core';
import { createFusedStream, type FusedStreamHandle } from './fused.js';
import { runPipeline, type RecordingHandle, type RecordingOptions } from './recording.js';

/** What the recording does with the active tab. */
export type ActiveTabState =
  /** Its session is on the way. */
  | 'attaching'
  /** The sources are on its live session. */
  | 'recording'
  /** The host may not record it; paused until the host reports it again. */
  | 'refused';

export interface ActiveTabOptions<Tab> extends RecordingOptions {
  /**
   * What the recording does with the active tab, each time that changes. Always
   * true when said. The tab the recording starts on is recorded from the start.
   */
  onActiveTab?(tab: Tab, state: ActiveTabState): void;
  /** Following ended on its own: `gone` (window or browser) or `revoked`. Call `stop()`. */
  onEnd?(why: 'gone' | 'revoked'): void;
}

export interface ActiveTabRecording extends RecordingHandle {
  /** The session the sources are on; null while nothing is recorded. */
  readonly cdp: CdpTransport | null;
}

/**
 * Record `tab`, then whichever tab becomes active: the same API on every host,
 * and the one place that decides which tab is recorded.
 *
 * A session is a debugger connection to one tab; the sources are what record,
 * and they sit on at most one session — the active tab's. A tab keeps its
 * session until Stop or until it closes, so switching back only moves the
 * sources and no tab is ever attached twice. Nothing waits for an attach.
 */
export async function recordActiveTab<Tab>(
  host: TabHost<Tab>,
  tab: Tab,
  options: ActiveTabOptions<Tab>,
): Promise<ActiveTabRecording> {
  const session = await host.attach(tab);

  let fused: FusedStreamHandle;
  try {
    fused = await createFusedStream(session.cdp, options);
  } catch (error) {
    await session.close();
    throw error;
  }

  return new ActiveTabFollower(host, fused, runPipeline(fused, options), tab, session, options);
}

class ActiveTabFollower<Tab> implements ActiveTabRecording {
  /** The tab the host last reported. */
  private active: Tab;
  private readonly sessions = new Map<Tab, TabSession>();
  /** Tabs whose attach is on its way: at most one per tab. */
  private readonly attaching = new Set<Tab>();
  /** The tab recorded now: its live session has the sources. */
  private sourcesOn: Tab | null;
  /** Where the sources last went, which decides whether a move is to another tab. */
  private lastTab: Tab;
  private following = true;
  private readonly unsubscribes: Unsubscribe[];
  private stopped: Promise<void> | null = null;

  constructor(
    private readonly host: TabHost<Tab>,
    private readonly fused: FusedStreamHandle,
    private readonly pipeline: RecordingHandle,
    tab: Tab,
    session: TabSession,
    private readonly options: ActiveTabOptions<Tab>,
  ) {
    this.active = this.lastTab = tab;
    this.sourcesOn = tab;
    this.keep(tab, session);
    this.unsubscribes = [
      host.onActive((active) => this.follow(active)),
      host.onGone(() => this.end('gone')),
    ];
  }

  get cdp(): CdpTransport | null {
    return this.sourcesOn === null ? null : (this.sessions.get(this.sourcesOn)?.cdp ?? null);
  }

  get stats(): PushStreamStats {
    return this.pipeline.stats;
  }

  /**
   * Stop following, flush the final resting state, drain, and close every
   * session. Never waits for an attach: one that resolves later is closed as
   * obsolete.
   */
  stop(): Promise<void> {
    return (this.stopped ??= (async () => {
      this.unfollow();
      try {
        await this.pipeline.stop();
      } finally {
        const sessions = [...this.sessions.values()];
        this.sessions.clear();
        await Promise.all(sessions.map((session) => session.close().catch(() => {})));
      }
    })());
  }

  /** The host says `tab` is active. Never waits. */
  private follow(tab: Tab): void {
    this.active = tab;
    if (!this.following || this.sourcesOn === tab) return;

    const session = this.sessions.get(tab);
    if (session) return void this.moveSources(tab, session);

    this.release(); // nothing is recorded until its session lands
    this.options.onActiveTab?.(tab, 'attaching');
    if (this.attaching.has(tab)) return;

    this.attaching.add(tab);
    this.host.attach(tab).then(
      (session) => this.attached(tab, session),
      () => this.refused(tab),
    );
  }

  private attached(tab: Tab, session: TabSession): void {
    this.attaching.delete(tab);
    if (!this.following || tab !== this.active) return void session.close(); // obsolete
    this.keep(tab, session);
    void this.moveSources(tab, session);
  }

  private refused(tab: Tab): void {
    this.attaching.delete(tab);
    if (this.following && tab === this.active) this.options.onActiveTab?.(tab, 'refused');
  }

  private keep(tab: Tab, session: TabSession): void {
    this.sessions.set(tab, session);
    session.onClosed((end) => this.lost(tab, session, end));
  }

  /** A session ended on its own. */
  private lost(tab: Tab, session: TabSession, end: SessionEnd): void {
    if (this.sessions.get(tab) !== session) return;
    this.sessions.delete(tab);
    if (end === 'revoked') return this.end('revoked');
    if (this.sourcesOn !== tab) return; // a tab left behind

    this.sourcesOn = null;
    this.follow(this.active); // a PDF: the same tab again; a closed tab: the next one
  }

  private async moveSources(tab: Tab, session: TabSession): Promise<void> {
    const otherTab = tab !== this.lastTab;
    this.sourcesOn = this.lastTab = tab;
    try {
      await this.fused.continueOn(session.cdp, { otherTab });
    } catch {
      if (this.sessions.get(tab) !== session) return; // lost meanwhile: `lost` moved on
      // Still alive, yet the sources would not go on: it can't be recorded.
      this.sessions.delete(tab);
      void session.close();
      if (this.sourcesOn === tab) {
        this.release();
        this.options.onActiveTab?.(tab, 'refused');
      }
      return;
    }
    if (this.sourcesOn === tab && this.sessions.get(tab) === session) {
      this.options.onActiveTab?.(tab, 'recording');
    }
  }

  /** Nothing is recorded: the sources come off. */
  private release(): void {
    this.sourcesOn = null;
    void this.fused.release();
  }

  private end(why: 'gone' | 'revoked'): void {
    if (!this.following) return;
    this.unfollow();
    this.options.onEnd?.(why);
  }

  private unfollow(): void {
    this.following = false;
    for (const unsubscribe of this.unsubscribes) unsubscribe();
  }
}
