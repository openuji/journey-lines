import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { headlessFromEnv, videoFromEnv } from '@openuji/cli-kit';
import type { CaptureSink } from '@openuji/core';
import type { MilestoneRule } from '@openuji/engine';
import { startRecording, type RecordingHandle } from '@openuji/fused';
import {
  DEFAULT_VIEWPORT,
  launchPuppeteerTarget,
  type PuppeteerTarget,
} from '@openuji/host-puppeteer';
import {
  ConsoleSink,
  PersistenceSink,
  startClipWorker,
  type ClipWorker,
} from '@openuji/sinks';

export interface StreamWatchOptions {
  url: string;
  outputDir?: string;
  rules?: readonly MilestoneRule[];
  headless?: boolean;
  viewport?: { width: number; height: number };
  /**
   * Where captures go. Defaults to console reporting plus PNG + NDJSON
   * persistence; pass `[new ConsoleSink()]` for a detection-only run, or add
   * your own `CaptureSink`.
   */
  sinks?: readonly CaptureSink[];
  /**
   * Also record a video of each scroll, written next to its `04`. Defaults to
   * `UXR_VIDEO`; off unless set. Needs the default sinks, which write it.
   */
  video?: boolean;
}

/**
 * Orchestrates a full end-to-end capture session: a Puppeteer-launched
 * browser as the host, and the host-agnostic recording pipeline (fused
 * streams, rules engine, sinks) running over its CDP transport.
 */
export class StreamWatchSession {
  private target: PuppeteerTarget | null = null;
  private recording: RecordingHandle | null = null;
  private clipWorker: ClipWorker | null = null;
  private isStopping = false;

  private sinks: readonly CaptureSink[] = [];

  public sessionDir = '';
  public ndjsonPath = '';

  /** Whether this session records a video of each scroll. */
  public get recordsVideo(): boolean {
    return this.clipWorker !== null;
  }

  constructor(private readonly options: StreamWatchOptions) {}

  public async start(): Promise<void> {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    this.sessionDir =
      this.options.outputDir ?? resolve('recordings', `session-${runId}`);
    await mkdir(this.sessionDir, { recursive: true });
    this.ndjsonPath = join(this.sessionDir, 'interactions.ndjson');

    const persistence = new PersistenceSink({
      outDir: this.sessionDir,
      logFile: this.ndjsonPath,
    });
    this.sinks = this.options.sinks ?? [new ConsoleSink(), persistence];

    // The one place the video setting is read: whether there is a clip sink.
    if (this.options.video ?? videoFromEnv()) {
      this.clipWorker = await startClipWorker((clip) => persistence.enqueueClip(clip));
    }

    console.log('Launching browser session...');
    this.target = await launchPuppeteerTarget({
      headless: this.options.headless ?? headlessFromEnv(),
      viewport: this.options.viewport ?? DEFAULT_VIEWPORT,
    });

    console.log('Initializing fused stream pipeline...');
    this.recording = await startRecording(this.target.cdp, {
      ...(this.options.rules ? { rules: this.options.rules } : {}),
      sinks: this.sinks,
      ...(this.clipWorker ? { clips: this.clipWorker.sink } : {}),
      screencast: { viewport: this.target.viewport },
    });

    console.log(`Navigating to ${this.options.url}...`);
    await this.target.navigate(this.options.url);
  }

  public async stop(): Promise<void> {
    if (this.isStopping) return;
    this.isStopping = true;

    console.log('\nStopping session and finalizing writes...');

    // Flushes the final resting state (99-before-navigation), stops the
    // streams, then drains the sinks — all before the browser goes away.
    let drainError: unknown = null;
    try {
      await this.recording?.stop();
    } catch (err) {
      drainError = err;
    }
    await this.clipWorker?.close();

    await this.target?.close();

    console.log('\nSession saved:');
    console.log(`  Screenshots: ${this.sessionDir}`);
    console.log(`  NDJSON Log:  ${this.ndjsonPath}`);

    const dropped = this.recording?.stats.dropped ?? 0;
    if (dropped > 0) {
      console.warn(
        `  \x1b[33mWarning: ${dropped} compositor frame(s) dropped under backpressure.\x1b[0m`,
      );
    }

    if (drainError) throw drainError;
    console.log('Done.');
  }

  /**
   * The recorded target, once `start()` has run. Exposes the Puppeteer
   * `page` and `browser` for driving the session programmatically.
   */
  public get targetHandle(): PuppeteerTarget | null {
    return this.target;
  }
}
