import type { CdpTransport } from '@openuji/cdp';
import {
  drainInStages,
  enqueueAll,
  noClips,
  type CaptureSink,
  type ClipSink,
  type PushStreamStats,
} from '@openuji/core';
import { RulesEngine, type EngineOutput, type MilestoneRule } from '@openuji/engine';
import { defaultRules } from './default-rules.js';
import { createFusedStream, type FusedStreamHandle, type FusedStreamOptions } from './fused.js';

export interface RecordingOptions extends FusedStreamOptions {
  /** Defaults to `defaultRules`. */
  rules?: readonly MilestoneRule[];
  /** Where captures go. */
  sinks: readonly CaptureSink[];
  /**
   * Where the rules' clip writes go: the recording makes videos only if one is
   * given. Default `noClips`.
   */
  clips?: ClipSink;
}

export interface RecordingHandle {
  /**
   * Flush the final resting state, stop the streams and drain every sink.
   * Rejects if any sink failed. Idempotent.
   */
  stop(): Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * The whole recording pipeline over a transport: fused stream → rules engine →
 * sinks. Host-agnostic — the CLI, an Electron main process and an extension
 * service worker all run exactly this.
 *
 * The engine only decides; this delivers what it decided: captures to the
 * capture sinks, clip writes to the clip sink.
 */
export async function startRecording(
  cdp: CdpTransport,
  options: RecordingOptions,
): Promise<RecordingHandle> {
  return runPipeline(await createFusedStream(cdp, options), options);
}

/**
 * Engine → sinks over a fused stream, until `stop`. `recordActiveTab`, which
 * moves the stream's sources from tab to tab, runs this same pipeline.
 * Internal: not exported from the package.
 */
export function runPipeline(
  fused: FusedStreamHandle,
  options: RecordingOptions,
): RecordingHandle {
  const { rules = defaultRules, sinks, clips = noClips } = options;
  const engine = new RulesEngine(rules);

  const deliver = ({ captures, clipWrites }: EngineOutput): void => {
    for (const capture of captures) enqueueAll(sinks, capture);
    for (const write of clipWrites) clips.enqueue(write);
  };

  let isStopping = false;

  const consumer = (async () => {
    for await (const event of fused.events) {
      if (isStopping) break;
      deliver(engine.processEvent(event));
    }
  })();

  let stopped: Promise<void> | null = null;

  const stop = (): Promise<void> =>
    (stopped ??= (async () => {
      isStopping = true;

      // Flush the final resting state (99-before-navigation) before teardown.
      deliver(engine.processEvent({ type: 'stop' }));

      await fused.stop().catch(() => {});
      await consumer.catch(() => {});

      // Clips first: a finished clip may still hand a file to a capture sink.
      await drainInStages([[clips], sinks]);
    })());

  return { stop, stats: fused.stats };
}
