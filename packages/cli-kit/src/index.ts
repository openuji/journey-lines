import type { RecordingTarget } from '@openuji/cdp';
import {
  DEFAULT_VIEWPORT,
  launchPuppeteerTarget,
  type WaitUntil,
} from '@openuji/host-puppeteer';

export const DEFAULT_TARGET_URL = 'https://example.com';
export { DEFAULT_VIEWPORT };

/** The URL to record: first positional argument, or a harmless default. */
export function targetUrlFromArgv(argv: readonly string[] = process.argv): string {
  return argv[2] ?? DEFAULT_TARGET_URL;
}

/**
 * Headed by default — these runners exist to watch a real person use a page.
 * `UXR_HEADLESS=1` exists so the CLIs can be exercised without a display.
 */
export function headlessFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return isOn(env['UXR_HEADLESS']);
}

/**
 * Off by default: each scroll is its `03`/`04` screenshots, each click its
 * `10`/`11`. `UXR_VIDEO=1` also records a video of each.
 */
export function videoFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return isOn(env['UXR_VIDEO']);
}

/**
 * The Chrome to run instead of the one Puppeteer pins, if any:
 * `UXR_CHROME_EXECUTABLE`, as the browser tests read it. A click's pictures are
 * placed by when frames were drawn from Chrome 156 on.
 */
export function chromeExecutableFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { executablePath?: string } {
  const executablePath = env['UXR_CHROME_EXECUTABLE'];
  return executablePath ? { executablePath } : {};
}

function isOn(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export interface StreamCliRun {
  /** Resolves when the consumer loop has drained the stream, if there is one. */
  readonly consumed?: Promise<void>;
  /** Shut the stream(s) down. */
  stop(): Promise<void>;
}

export interface StreamCliOptions {
  /** Shown while launching, e.g. "standalone compositor stream". */
  readonly label: string;
  /** Printed once the page has navigated. */
  readonly ready: string;
  readonly targetUrl?: string;
  readonly headless?: boolean;
  readonly waitUntil?: WaitUntil;
  /** Wire up the stream against the target's transport and start consuming it. */
  run(target: RecordingTarget): Promise<StreamCliRun>;
}

/**
 * Shared harness for the standalone stream runners.
 *
 * Each stream is independently runnable by design — that is the point of the
 * three-stream split — so this exists to keep the entry points from each
 * re-implementing browser launch, navigation and signal handling.
 */
export async function runStreamCli(options: StreamCliOptions): Promise<void> {
  const targetUrl = options.targetUrl ?? targetUrlFromArgv();

  console.log(`Launching browser (${options.label})...`);
  const target = await launchPuppeteerTarget({
    headless: options.headless ?? headlessFromEnv(),
    viewport: DEFAULT_VIEWPORT,
    ...chromeExecutableFromEnv(),
  });

  const session = await options.run(target);

  console.log(`Navigating to ${targetUrl}...`);
  await target.navigate(targetUrl, { waitUntil: options.waitUntil ?? 'commit' });
  console.log(options.ready);

  await new Promise<void>((resolve) => {
    installShutdown(target, async () => {
      await session.stop();
      await session.consumed?.catch(() => {});
      resolve();
    });
  });

  await target.close();
  console.log('Done.');
}

/**
 * Run `teardown` once, on whichever comes first: Ctrl+C, SIGTERM, or the
 * target going away on its own (the user closing the browser window).
 */
export function installShutdown(
  target: Pick<RecordingTarget, 'onClosed'>,
  teardown: () => Promise<void>,
): void {
  let started = false;

  const once = (): void => {
    if (started) return;
    started = true;
    void teardown().catch((err) => {
      console.error('Shutdown failed:', err);
    });
  };

  process.on('SIGINT', once);
  process.on('SIGTERM', once);
  target.onClosed(once);
}

/** Wrap a CLI `main` so failures exit non-zero with a readable message. */
export function runMain(main: () => Promise<void>): void {
  void main().then(
    () => process.exit(0),
    (err: unknown) => {
      console.error('Fatal error:', err);
      process.exit(1);
    },
  );
}
