import type { CdpTransport, TabHost } from '@openuji/cdp';
import type { CaptureSink, Clip, MilestoneCapture } from '@openuji/core';
import type { ClipWorker } from '@openuji/clip-webm';
import { recordActiveTab, type ActiveTabRecording, type FollowStatus } from '@openuji/fused';
import type { OpenClips } from './clips';
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
 * each scroll and click when asked for — in memory. Each change goes out through `emit`
 * as a `WorkerMessage`. Failures reject the call that caused them and leave the
 * state as it was.
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
  /** Set while a tab is being attached, so a second Record waits its turn. */
  private starting = false;

  constructor(
    private readonly tabsOf: TabsOf,
    private readonly describeTab: DescribeTab,
    private readonly emit: (message: WorkerMessage) => void,
    private readonly openClips?: OpenClips,
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
    try {
      // The one place the video setting is read: whether there is a clip sink.
      const clipWorker = options.video ? await this.startClips() : null;
      const journey: MilestoneCapture[] = [];

      let recording: ActiveTabRecording<number>;
      try {
        recording = await recordActiveTab(this.tabsOf(tab.windowId), tab.id, {
          sinks: [this.sink(journey)],
          ...(clipWorker ? { clips: clipWorker.sink } : {}),
        });
      } catch (error) {
        await clipWorker?.close();
        throw error;
      }

      this.recording = recording;
      this.clipWorker = clipWorker;
      this.journey = journey;
      this.videos = [];
      this.current = {
        state: 'recording',
        tab,
        active: { tab, state: recording.status.active.state },
        startedAtMs: this.now(),
      };
      // A snapshot, not a status: panels drop the previous journey with it.
      this.emit(this.snapshot());
      recording.onStatus((status) => {
        if (status.ended) void this.stop(endedByChrome[status.ended]);
        else void this.showActive(status);
      });
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

    try {
      // Drains the clip sink too: the last video is in by now.
      await recording.stop();
    } finally {
      await this.clipWorker?.close();
      this.clipWorker = null;
      this.recording = null;
      this.setStatus({
        state: 'done',
        tab,
        startedAtMs,
        endedAtMs,
        endedBy,
        droppedFrames: recording.stats.dropped,
      });
    }
  }

  /** Leave a finished recording. Its journey is gone after this. */
  reset(): void {
    if (this.current.state !== 'done') return;
    this.journey = [];
    this.videos = [];
    this.current = { state: 'idle' };
    this.emit(this.snapshot());
  }

  /**
   * Where the pipeline's captures go: onto `journey`, and out to the panels
   * once it is the journey shown. Captures that come before carry over in the
   * recording's first snapshot.
   */
  private sink(journey: MilestoneCapture[]): CaptureSink {
    return {
      name: 'journey',
      enqueue: (capture) => {
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
  private startClips(): Promise<ClipWorker> {
    if (!this.openClips) throw new Error('This recorder cannot make videos.');
    return this.openClips((clip) => {
      this.videos.push(clip);
      this.emit({ type: 'clip', clip });
    });
  }

  private setStatus(status: RecorderStatus): void {
    this.current = status;
    this.emit({ type: 'status', status });
  }
}
