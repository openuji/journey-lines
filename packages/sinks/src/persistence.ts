import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  artifactFileName,
  captureLogRecord,
  clipLogRecord,
  type CaptureSink,
  type Clip,
  type ClipFiling,
  type ClipLogRecord,
  type InteractionLogRecord,
  type MilestoneCapture,
} from '@openuji/core';

export interface PersistenceSinkOptions {
  /** Directory PNG screenshots are written into. */
  readonly outDir: string;
  /** Path of the NDJSON log appended to. */
  readonly logFile: string;
}

export interface PersistenceFailure {
  readonly file: string;
  readonly error: unknown;
}

/**
 * Writes each capture as a PNG plus one NDJSON record, and each kept clip
 * (`enqueueClip`) as a WebM plus one record, in the same log and sequence.
 *
 * `enqueue` is non-blocking because it runs inside the fused-stream consumer
 * loop, which must keep draining. Work is chained onto a single promise so a
 * screenshot and its log line are never interleaved with another capture's, and
 * so records land in capture order. Failures are collected and re-raised from
 * `drain` rather than being swallowed.
 */
export class PersistenceSink implements CaptureSink {
  public readonly name = 'persistence';
  public readonly outDir: string;
  public readonly logFile: string;

  private writeQueue: Promise<void> = Promise.resolve();
  private sequence = 0;
  private readonly failures: PersistenceFailure[] = [];

  constructor(options: PersistenceSinkOptions) {
    this.outDir = options.outDir;
    this.logFile = options.logFile;
  }

  public enqueue(capture: MilestoneCapture): void {
    const file = this.fileFor(capture, 'png');
    this.persist(file, capture.frame.base64, (sequence, epochMs): InteractionLogRecord =>
      captureLogRecord(capture, sequence, file.path, epochMs),
    );
  }

  /** A kept clip: its video next to the capture it belongs to, and its trace in the log. */
  public enqueueClip(clip: Clip): void {
    const file = this.fileFor(clip, 'webm');
    this.persist(file, clip.base64, (sequence, epochMs): ClipLogRecord =>
      clipLogRecord(clip, sequence, file.path, epochMs),
    );
  }

  /** One number per view: a page load and an SPA route change each start one. */
  private fileFor(filing: ClipFiling, extension: 'png' | 'webm'): { name: string; path: string } {
    const name = artifactFileName(filing, extension);
    return { name, path: join(this.outDir, name) };
  }

  /**
   * Writes `base64` to `file`, then appends its record, after everything
   * enqueued before: a file and its line are never interleaved with another's,
   * and records land in order.
   */
  private persist(
    file: { name: string; path: string },
    base64: string,
    record: (sequence: number, epochMs: number) => InteractionLogRecord | ClipLogRecord,
  ): void {
    const line = `${JSON.stringify(record(++this.sequence, Date.now()))}\n`;

    this.writeQueue = this.writeQueue
      .then(async () => {
        // Node decodes base64 natively here; no intermediate copy.
        await writeFile(file.path, base64, 'base64');
        await appendFile(this.logFile, line, 'utf8');
      })
      .catch((error: unknown) => {
        console.error(`[Sink] Failed to write ${file.name}:`, error);
        this.failures.push({ file: file.name, error });
      });
  }

  public async drain(): Promise<void> {
    await this.writeQueue;

    if (this.failures.length > 0) {
      const summary = this.failures
        .map(({ file, error }) => `${file}: ${String(error)}`)
        .join('\n  ');
      throw new Error(
        `${this.failures.length} capture(s) failed to persist:\n  ${summary}`,
      );
    }
  }
}
