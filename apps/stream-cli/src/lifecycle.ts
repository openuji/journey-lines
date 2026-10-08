#!/usr/bin/env node
import { runMain, runStreamCli } from '@openuji/cli-kit';
import { documentKinds } from '@openuji/fused';
import { createLifecycleStream } from '@openuji/stream-lifecycle';

const RESET = '\x1b[0m';

const elapsed = (ms: number): string => `+${ms.toFixed(0).padStart(6, ' ')}ms`;

/**
 * Standalone lifecycle stream: live navigations, and for each document what
 * its kind reports — how far it has come, and what the probe sees in it.
 *
 * Lines print in arrival order — the order fusion uses. The `+…ms` column is
 * host receipt time since the first event.
 */
runMain(async () => {
  await runStreamCli({
    label: 'standalone lifecycle stream',
    ready: 'Page navigated. Interact with links/forms. Press Ctrl+C to stop.\n',
    run: async (target) => {
      console.log('Starting lifecycle stream...');
      const { events, stop } = await createLifecycleStream(target.cdp, documentKinds);

      const consumed = (async () => {
        let baseline: number | null = null;

        for await (const event of events) {
          baseline ??= event.receivedAtMs;
          const received = elapsed(event.receivedAtMs - baseline);

          if (event.type === 'navigated') {
            const scope = event.isMainFrame ? '[MainFrame]' : '[SubFrame ]';
            const kind = event.sameDocument
              ? ` (same document, ${event.navigationType ?? 'other'})`
              : '';
            console.log(
              `\x1b[32m${scope} NAVIGATED${RESET}${kind} | ` +
                `frame: ${event.frameId.slice(0, 8)} | loader: ${event.loaderId.slice(0, 8)} | ` +
                `${received} | url: ${event.url}`,
            );
          } else if (event.type === 'milestone') {
            console.log(
              `\x1b[36m[MainFrame] ${event.name.toUpperCase().padEnd(9, ' ')}${RESET} | ` +
                `loader: ${event.loaderId.slice(0, 8)} | ${received}`,
            );
          } else {
            console.log(`\x1b[90m[Probe    ] ${event.type}${RESET} | ${received}`);
          }
        }
      })();

      return { consumed, stop };
    },
  });
});
