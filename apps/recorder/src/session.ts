import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { headlessFromEnv, videoFromEnv } from '@openuji/cli-kit';
import type { CaptureSink } from '@openuji/core';
import type { MilestoneRule } from '@openuji/engine';
import { recordActiveTab, type ActiveTabRecording } from '@openuji/fused';
import {
  DEFAULT_VIEWPORT,
  launchPuppeteerBrowser,
  type PuppeteerBrowser,
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
 * streams, rules engine, sinks) following its active tab.
 */
export class StreamWatchSession {
  private chrome: PuppeteerBrowser | null = null;
  private recording: ActiveTabRecording | null = null;
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
    const chrome = await launchPuppeteerBrowser({
      headless: this.options.headless ?? headlessFromEnv(),
      viewport: this.options.viewport ?? DEFAULT_VIEWPORT,
    });
    this.chrome = chrome;

    console.log('Initializing fused stream pipeline...');
    this.recording = await recordActiveTab(chrome.tabs, chrome.firstTab, {
      ...(this.options.rules ? { rules: this.options.rules } : {}),
      sinks: this.sinks,
      ...(this.clipWorker ? { clips: this.clipWorker.sink } : {}),
      screencast: { viewport: chrome.viewport },
      onActiveTab: (tab, state) => {
        if (state !== 'recording') console.log(`Active tab ${state}: ${tab.url()}`);
      },
    });

    console.log(`Navigating to ${this.options.url}...`);
    await chrome.navigate(this.options.url);
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

    await this.chrome?.close();

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
   * The launched browser, once `start()` has run. Exposes the Puppeteer
   * `browser` and its tabs for driving the session programmatically.
   */
  public get browserHandle(): PuppeteerBrowser | null {
    return this.chrome;
  }
}
