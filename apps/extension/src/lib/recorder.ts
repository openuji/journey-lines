import type { CdpTransport } from '@openuji/cdp';
import type { CaptureSink, Clip, MilestoneCapture } from '@openuji/core';
import type { ClipWorker } from '@openuji/clip-webm';
import { startRecording, type RecordingHandle } from '@openuji/fused';
import type { DetachReason, ExtensionTarget } from '@openuji/host-extension';
import type { OpenClips } from './clips';
import { MemoryRecordingStore, type RecordingStore } from './recording-store';
import type {
  EndedBy,
  RecorderStatus,
  RecordOptions,
  TabSummary,
  WorkerMessage,
} from './protocol';

export type AttachTab = (tabId: number) => Promise<ExtensionTarget>;

const endedByChrome: Record<DetachReason, EndedBy> = {
  target_closed: 'tab-closed',
  canceled_by_user: 'debugging-cancelled',
};

/**
 * Records one tab at a time: idle → recording → stopping → done.
 *
 * Runs the same pipeline as every other host (`startRecording`) over the
 * attached tab, and keeps the journey — every capture so far, and the video of
 * each scroll when asked for — in memory and through the injected recording
 * store. Each change goes out through `emit` as a `WorkerMessage`.
 *
 * No `chrome.*` in here: the tab comes from the injected `attach`, the video
 * encoder from `openClips`, so this runs unchanged in tests.
 */
export class Recorder {
  private current: RecorderStatus = { state: 'idle' };
  private journey: MilestoneCapture[] = [];
  private videos: Clip[] = [];
  private target: ExtensionTarget | null = null;
  private recording: RecordingHandle | null = null;
  private clipWorker: ClipWorker | null = null;
  private sessionId: string | null = null;
  /** Set while a tab is being attached, so a second Record waits its turn. */
  private starting = false;

  constructor(
    private readonly attach: AttachTab,
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

  /** The recorded tab's CDP connection, null when nothing is recorded. */
  get cdp(): CdpTransport | null {
    return this.target?.cdp ?? null;
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
      const target = await this.attach(tab.id);
      this.target = target;
      try {
        const startedAtMs = target.cdp.clock.now();
        this.sessionId = await this.store.begin(tab, startedAtMs);
        this.journey = [];
        this.videos = [];
        this.current = { state: 'recording', tab, startedAtMs };
        // A snapshot, not a status: panels drop the previous journey with it.
        this.emit(this.snapshot());

        target.onClosed((reason) => {
          void this.stop(endedByChrome[reason]).catch((error: unknown) => {
            this.emit({ type: 'error', message: `Could not finish recording: ${String(error)}` });
          });
        });

        // The one place the video setting is read: whether there is a clip sink.
        this.clipWorker = options.video ? await this.startClips() : null;
        this.recording = await startRecording(target.cdp, {
          sinks: [this.sink()],
          ...(this.clipWorker ? { clips: this.clipWorker.sink } : {}),
        });
      } catch (error) {
        await this.clipWorker?.close();
        this.clipWorker = null;
        await target.close();
        this.target = null;
        if (this.sessionId) await this.store.discard(this.sessionId);
        this.sessionId = null;
        this.journey = [];
        this.videos = [];
        this.current = { state: 'idle' };
        this.emit(this.snapshot());
        throw error;
      }
    } finally {
      this.starting = false;
    }
  }

  /**
   * Flush the final resting state (`99-before-navigation`), drain, and hand
   * the tab back. A no-op unless recording, so the person pressing Stop and
   * Chrome closing the tab can race harmlessly.
   */
  async stop(endedBy: EndedBy = 'user'): Promise<void> {
    if (this.current.state !== 'recording' || !this.target) return;

    const { tab, startedAtMs } = this.current;
    const target = this.target;
    const endedAtMs = target.cdp.clock.now();
    this.setStatus({ state: 'stopping', tab, startedAtMs });

    const failures: unknown[] = [];
    try {
      // Drains the clip sink too: the last scroll's video is in by now.
      await this.recording?.stop();
    } catch (error) {
      failures.push(error);
    }
    const droppedFrames = this.recording?.stats.dropped ?? 0;
    try { await this.clipWorker?.close(); } catch (error) { failures.push(error); }
    this.clipWorker = null;
    try { await target.close(); } catch (error) { failures.push(error); }
    this.target = null;
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
    this.setStatus({ state: 'done', tab, startedAtMs, endedAtMs, endedBy, droppedFrames, ...(sessionId ? { sessionId } : {}) });
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

  /** Where the pipeline's captures go: onto the journey, and out to the panels. */
  private sink(): CaptureSink {
    return {
      name: 'journey',
      enqueue: (capture) => {
        if (this.sessionId) this.store.appendCapture(this.sessionId, capture);
        this.journey.push(capture);
        this.emit({ type: 'capture', capture });
      },
      drain: async () => {},
    };
  }

  /** The video encoder, its clips going onto the journey and out to the panels. */
  private startClips(): Promise<ClipWorker> {
    if (!this.openClips) throw new Error('This recorder cannot make videos.');
    return this.openClips((clip) => {
      if (this.sessionId) this.store.appendClip(this.sessionId, clip, this.target?.cdp.clock.now() ?? Date.now());
      this.videos.push(clip);
      this.emit({ type: 'clip', clip });
    });
  }

  private setStatus(status: RecorderStatus): void {
    this.current = status;
    this.emit({ type: 'status', status });
  }
}
