import {
  base64ByteLength,
  type CaptureSink,
  type MilestoneCapture,
} from '@openuji/core';

const RESET = '\x1b[0m';
const MAGENTA = '\x1b[35m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREY = '\x1b[90m';

function colorFor(label: string): string {
  if (label.includes('click') || label.includes('scroll')) return MAGENTA;
  if (label.includes('99')) return YELLOW;
  return CYAN;
}

export interface ConsoleSinkOptions {
  /** Also print the DOM target line for interaction captures. Default true. */
  readonly showDomTarget?: boolean;
}

/**
 * Reports captures to the terminal as they are detected.
 *
 * The recorder pairs this with the persistence sink; the standalone stream CLIs
 * use it alone, which is what makes a detection-only run possible with no disk
 * writes at all.
 */
export class ConsoleSink implements CaptureSink {
  public readonly name = 'console';
  private readonly showDomTarget: boolean;

  constructor(options: ConsoleSinkOptions = {}) {
    this.showDomTarget = options.showDomTarget ?? true;
  }

  public enqueue(capture: MilestoneCapture): void {
    const loader = capture.loaderId.slice(0, 8);
    const sizeKb = (base64ByteLength(capture.frame.base64) / 1024).toFixed(1);
    const color = colorFor(capture.label);

    const view = `NAV #${capture.viewId}${capture.entry === 'route' ? ' route' : ''}`;

    console.log(
      `${color}★ [${view}] ${capture.label.padEnd(20, ' ')}${RESET} | ` +
        `loader: ${loader} | ` +
        `frame #${capture.frame.index} (${sizeKb} KB) | ` +
        `${capture.detail}`,
    );

    const target = capture.domTarget;
    if (this.showDomTarget && target) {
      console.log(
        `    ${GREY}↳ DOM: <${target.selector}> text:"${target.textSnippet ?? ''}" ` +
          `role:${target.role ?? '-'} at:(${target.clientX}, ${target.clientY}) ` +
          `rect:[${target.boundingRect.width}x${target.boundingRect.height}]${RESET}`,
      );
    }
  }

  public async drain(): Promise<void> {
    // Console writes are synchronous; nothing is deferred.
  }
}
