import type { MilestoneCapture } from './domain.js';

/**
 * A destination for milestone captures. Sinks are optional and composable: the
 * recorder fans every capture out to whichever set it was configured with, and
 * the standalone stream CLIs use the console sink alone.
 *
 * `enqueue` must be non-blocking — it is called from inside the event consumer
 * loop, which must keep draining the fused stream. Defer real work and settle
 * it in `drain`.
 */
export interface CaptureSink {
  readonly name: string;
  enqueue(capture: MilestoneCapture): void;
  /** Await all deferred work. Rejects if any of it failed. */
  drain(): Promise<void>;
}

/** Fan one capture out to several sinks. */
export function enqueueAll(
  sinks: readonly CaptureSink[],
  capture: MilestoneCapture,
): void {
  for (const sink of sinks) {
    sink.enqueue(capture);
  }
}

/** Anything that settles deferred work: capture sinks and clip sinks alike. */
export type Drainable = Readonly<{ name: string; drain(): Promise<void> }>;

/** Drain every sink, surfacing all failures rather than just the first. */
export function drainAll(sinks: readonly Drainable[]): Promise<void> {
  return drainInStages([sinks]);
}

/**
 * Drain stage after stage, the sinks of one stage together: a later stage may
 * still receive work while an earlier one settles. Every failure of every
 * stage is reported, once all are done.
 */
export async function drainInStages(
  stages: readonly (readonly Drainable[])[],
): Promise<void> {
  const failures: string[] = [];
  for (const sinks of stages) {
    const results = await Promise.allSettled(sinks.map((sink) => sink.drain()));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        failures.push(`${sinks[i]?.name ?? 'sink'}: ${String(result.reason)}`);
      }
    });
  }

  if (failures.length > 0) {
    throw new Error(`Sink drain failed:\n  ${failures.join('\n  ')}`);
  }
}
