import type { CdpTransport } from '@openuji/cdp';
import type { CaptureSink, MilestoneCapture } from '@openuji/core';
import { startRecording, type RecordingHandle } from '@openuji/fused';
import type { DetachReason, ExtensionTarget } from '@openuji/host-extension';
import type { EndedBy, RecorderStatus, TabSummary, WorkerMessage } from './protocol';

export type AttachTab = (tabId: number) => Promise<ExtensionTarget>;

const endedByChrome: Record<DetachReason, EndedBy> = {
  target_closed: 'tab-closed',
  canceled_by_user: 'debugging-cancelled',
};

/**
 * Records one tab at a time: idle → recording → stopping → done.
 *
 * Runs the same pipeline as every other host (`startRecording`) over the
 * attached tab, and keeps the journey — every capture so far — in memory.
 * Each change goes out through `emit` as a `WorkerMessage`. Failures reject the
 * call that caused them and leave the state as it was.
 *
 * No `chrome.*` in here: the tab comes from the injected `attach`, so this runs
 * unchanged in tests.
 */
export class Recorder {
  private current: RecorderStatus = { state: 'idle' };
  private journey: MilestoneCapture[] = [];
  private target: ExtensionTarget | null = null;
  private recording: RecordingHandle | null = null;
  /** Set while a tab is being attached, so a second Record waits its turn. */
  private starting = false;

  constructor(
    private readonly attach: AttachTab,
    private readonly emit: (message: WorkerMessage) => void,
  ) {}

  get status(): RecorderStatus {
    return this.current;
  }

  get captures(): readonly MilestoneCapture[] {
    return this.journey;
  }

  /** The recorded tab's CDP connection, null when nothing is recorded. */
  get cdp(): CdpTransport | null {
    return this.target?.cdp ?? null;
  }

  /** Everything a newly opened panel needs to show. */
  snapshot(): WorkerMessage {
    return { type: 'snapshot', status: this.current, captures: [...this.journey] };
  }

  async record(tab: TabSummary): Promise<void> {
    const { state } = this.current;
    if (this.starting || state === 'recording' || state === 'stopping') {
      throw new Error('Already recording. Stop the current recording first.');
    }

    this.starting = true;
    try {
      const target = await this.attach(tab.id);

      this.target = target;
      this.journey = [];
      this.current = { state: 'recording', tab, startedAtMs: target.cdp.now() };
      // A snapshot, not a status: panels drop the previous journey with it.
      this.emit(this.snapshot());

      target.onClosed((reason) => void this.stop(endedByChrome[reason]));

      try {
        this.recording = await startRecording(target.cdp, { sinks: [this.sink()] });
      } catch (error) {
        await target.close();
        this.target = null;
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
    const endedAtMs = target.cdp.now();
    this.setStatus({ state: 'stopping', tab, startedAtMs });

    try {
      await this.recording?.stop();
    } finally {
      const droppedFrames = this.recording?.stats.dropped ?? 0;
      await target.close();
      this.target = null;
      this.recording = null;
      this.setStatus({ state: 'done', tab, startedAtMs, endedAtMs, endedBy, droppedFrames });
    }
  }

  /** Leave a finished recording. Its journey is gone after this. */
  reset(): void {
    if (this.current.state !== 'done') return;
    this.journey = [];
    this.current = { state: 'idle' };
    this.emit(this.snapshot());
  }

  /** Where the pipeline's captures go: onto the journey, and out to the panels. */
  private sink(): CaptureSink {
    return {
      name: 'journey',
      enqueue: (capture) => {
        this.journey.push(capture);
        this.emit({ type: 'capture', capture });
      },
      drain: async () => {},
    };
  }

  private setStatus(status: RecorderStatus): void {
    this.current = status;
    this.emit({ type: 'status', status });
  }
}
