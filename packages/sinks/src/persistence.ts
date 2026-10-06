import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  base64ByteLength,
  type CaptureSink,
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
 * Writes each capture as a PNG plus one NDJSON record.
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
    const sequence = ++this.sequence;
    // One number per view: a page load and an SPA route change each start one.
    const filename = `nav-${String(capture.viewId).padStart(5, '0')}-${capture.label}.png`;
    const screenshotPath = join(this.outDir, filename);

    const record: InteractionLogRecord = {
      sequence,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      viewId: capture.viewId,
      entry: capture.entry,
      documentId: capture.documentId,
      loaderId: capture.loaderId,
      url: capture.url,
      label: capture.label,
      screenshotFile: filename,
      screenshotPath,
      byteLength: base64ByteLength(capture.frame.base64),
      scroll: {
        x: capture.frame.scrollX,
        y: capture.frame.scrollY,
      },
      detail: capture.detail,
      ...(capture.domTarget ? { domTarget: capture.domTarget } : {}),
    };

    const line = `${JSON.stringify(record)}\n`;

    this.writeQueue = this.writeQueue
      .then(async () => {
        // Node decodes base64 natively here; no intermediate copy.
        await writeFile(screenshotPath, capture.frame.base64, 'base64');
        await appendFile(this.logFile, line, 'utf8');
      })
      .catch((error: unknown) => {
        console.error(`[Sink] Failed to write ${filename}:`, error);
        this.failures.push({ file: filename, error });
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
