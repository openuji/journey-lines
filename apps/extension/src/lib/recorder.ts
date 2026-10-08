import type { CdpTransport, TabHost } from '@openuji/cdp';
import type { CaptureSink, Clip, MilestoneCapture } from '@openuji/core';
import type { ClipWorker } from '@openuji/clip-webm';
import { recordActiveTab, type ActiveTabRecording, type FollowStatus } from '@openuji/fused';
import type { OpenClips } from './clips';
import { MemoryRecordingStore, type RecordingItem, type RecordingStore } from './recording-store';
import type {
  EndedBy,
  RecorderStatus,
  RecordOptions,
  TabSummary,
  WorkerMessage,
} from './protocol';

/** The tabs of one window, as the recording follows them. */
export type TabsOf = (windowId: number) => TabHost<number>;
export type DescribeTab = (tabId: number) => Promise<TabSummary>;

const endedByChrome: Record<'gone' | 'revoked', EndedBy> = {
  gone: 'window-closed',
  revoked: 'debugging-cancelled',
};

/**
 * Records the active tab of one window: idle → recording → stopping → done.
 *
 * Runs the same pipeline as every other host (`recordActiveTab`) over the
 * window's tabs, and keeps the journey — every capture so far, and the video of
 * each scroll when asked for — in memory and through the injected recording
 * store. Each change goes out through `emit` as a `WorkerMessage`.
 *
 * No `chrome.*` in here: the tabs come from the injected `tabsOf`, the video
 * encoder from `openClips`, so this runs unchanged in tests.
 */
export class Recorder {
  private current: RecorderStatus = { state: 'idle' };
  private journey: MilestoneCapture[] = [];
  private videos: Clip[] = [];
  private recording: ActiveTabRecording<number> | null = null;
  private clipWorker: ClipWorker | null = null;
  private sessionId: string | null = null;
  /** Set while a tab is being attached, so a second Record waits its turn. */
  private starting = false;

  constructor(
    private readonly tabsOf: TabsOf,
    private readonly describeTab: DescribeTab,
    private readonly emit: (message: WorkerMessage) => void,
    private readonly openClips?: OpenClips,
    private readonly store: RecordingStore = new MemoryRecordingStore(),
  ) {}

  get status(): RecorderStatus {
    return this.current;
  }

  get captures(): readonly MilestoneCapture[] {
    return this.journey;
  }

  /** The videos made so far, each filed like the capture it belongs to. */
  get clips(): readonly Clip[] {
    return this.videos;
  }

  /** The active tab's CDP connection; null when nothing is recorded. */
  get cdp(): CdpTransport | null {
    return this.recording?.cdp ?? null;
  }

  /** Everything a newly opened panel needs to show. */
  snapshot(): WorkerMessage {
    return {
      type: 'snapshot',
      status: this.current,
      captures: [...this.journey],
      clips: [...this.videos],
    };
  }

  async record(tab: TabSummary, options: RecordOptions = { video: false }): Promise<void> {
    const { state } = this.current;
    if (this.starting || state === 'recording' || state === 'stopping') {
      throw new Error('Already recording. Stop the current recording first.');
    }

    this.starting = true;
    const journey: MilestoneCapture[] = [];
    const videos: Clip[] = [];
    const pending: RecordingItem[] = [];
    let recording: ActiveTabRecording<number> | null = null;
    let clipWorker: ClipWorker | null = null;
    let sessionId: string | null = null;

    const append = (item: RecordingItem): void => {
      if (!sessionId) {
        pending.push(item);
      } else if (item.kind === 'capture') {
        this.store.appendCapture(sessionId, item.capture);
      } else {
        this.store.appendClip(sessionId, item.clip, item.epochMs);
      }
    };

    try {
      // The one place the video setting is read: whether there is a clip sink.
      clipWorker = options.video
        ? await this.startClips(videos, (clip) => append({
            kind: 'clip',
            epochMs: recording?.cdp?.clock.now() ?? Date.now(),
            clip,
          }))
        : null;
      recording = await recordActiveTab(this.tabsOf(tab.windowId), tab.id, {
        sinks: [this.sink(journey, (capture) => append({
          kind: 'capture',
          epochMs: capture.frame.receivedAtMs,
          capture,
        }))],
        ...(clipWorker ? { clips: clipWorker.sink } : {}),
      });

      const startedAtMs = recording.cdp?.clock.now() ?? Date.now();
      sessionId = await this.store.begin(tab, startedAtMs);
      // Captures can arrive while the first tab is attaching. Replay that
      // ordered prefix before callbacks begin writing directly to the store.
      for (const item of pending) {
        if (item.kind === 'capture') this.store.appendCapture(sessionId, item.capture);
        else this.store.appendClip(sessionId, item.clip, item.epochMs);
      }

      this.recording = recording;
      this.clipWorker = clipWorker;
      this.sessionId = sessionId;
      this.journey = journey;
      this.videos = videos;
      this.current = {
        state: 'recording',
        tab,
        active: { tab, state: recording.status.active.state },
        startedAtMs,
      };
      // A snapshot, not a status: panels drop the previous journey with it.
      this.emit(this.snapshot());
      recording.onStatus((status) => {
        if (status.ended) {
          void this.stop(endedByChrome[status.ended]).catch((error: unknown) => {
            this.emit({ type: 'error', message: `Could not finish recording: ${String(error)}` });
          });
        } else {
          void this.showActive(status);
        }
      });
    } catch (error) {
      await recording?.stop().catch(() => {});
      await clipWorker?.close().catch(() => {});
      if (sessionId) await this.store.discard(sessionId).catch(() => {});
      throw error;
    } finally {
      this.starting = false;
    }
  }

  /**
   * Flush the final resting state (`99-before-navigation`), drain, and hand
   * every tab back. A no-op unless recording, so the person pressing Stop and
   * Chrome ending the recording can race harmlessly.
   */
  async stop(endedBy: EndedBy = 'user'): Promise<void> {
    if (this.current.state !== 'recording' || !this.recording) return;

    const { tab, active, startedAtMs } = this.current;
    const recording = this.recording;
    const endedAtMs = this.now();
    this.setStatus({ state: 'stopping', tab, active, startedAtMs });

    const failures: unknown[] = [];
    try {
      // Drains the clip sink too: the last scroll's video is in by now.
      await recording.stop();
    } catch (error) {
      failures.push(error);
    }
    const droppedFrames = recording.stats.dropped;
    try { await this.clipWorker?.close(); } catch (error) { failures.push(error); }
    this.clipWorker = null;
    this.recording = null;

    let sessionId: string | undefined;
    if (this.sessionId && failures.length === 0) {
      try {
        await this.store.finish(this.sessionId, endedAtMs, endedBy, droppedFrames);
        sessionId = this.sessionId;
      } catch (error) {
        failures.push(error);
      }
    }
    if (this.sessionId && !sessionId) {
      try { await this.store.discard(this.sessionId); } catch (error) { failures.push(error); }
    }
    this.setStatus({
      state: 'done',
      tab,
      startedAtMs,
      endedAtMs,
      endedBy,
      droppedFrames,
      ...(sessionId ? { sessionId } : {}),
    });
    if (failures.length) throw new Error(`Could not finish recording: ${failures.map(String).join('; ')}`);
  }

  /** Leave a finished recording. Its journey is gone after this. */
  reset(): void {
    if (this.current.state !== 'done') return;
    this.journey = [];
    this.videos = [];
    this.sessionId = null;
    this.current = { state: 'idle' };
    this.emit(this.snapshot());
  }

  /**
   * Where the pipeline's captures go: onto `journey`, into the report store,
   * and out to the panels once it is the journey shown. Captures that arrive
   * while the first tab attaches carry over in the recording's first snapshot.
   */
  private sink(journey: MilestoneCapture[], onCapture: (capture: MilestoneCapture) => void): CaptureSink {
    return {
      name: 'journey',
      enqueue: (capture) => {
        onCapture(capture);
        journey.push(capture);
        if (this.journey === journey) this.emit({ type: 'capture', capture });
      },
      drain: async () => {},
    };
  }

  /** What the recording does with the active tab, out to the panels. */
  private async showActive(status: FollowStatus<number>): Promise<void> {
    const tab = await this.describeTab(status.active.tab).catch(() => null);
    // Gone meanwhile (a closed tab), or no longer the recording's status.
    if (!tab || this.recording?.status !== status) return;
    const current = this.current;
    if ('active' in current) this.setStatus({ ...current, active: { tab, state: status.active.state } });
  }

  /** The transport's clock, as captures are stamped; `Date.now` while nothing is recorded. */
  private now(): number {
    return this.recording?.cdp?.clock.now() ?? Date.now();
  }

  /** The video encoder, its clips going onto the journey and out to the panels. */
  private startClips(videos: Clip[], onClip: (clip: Clip) => void): Promise<ClipWorker> {
    if (!this.openClips) throw new Error('This recorder cannot make videos.');
    return this.openClips((clip) => {
      onClip(clip);
      videos.push(clip);
      if (this.videos === videos) this.emit({ type: 'clip', clip });
    });
  }

  private setStatus(status: RecorderStatus): void {
    this.current = status;
    this.emit({ type: 'status', status });
  }
}
