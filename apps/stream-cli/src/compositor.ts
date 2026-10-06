#!/usr/bin/env node
import { runMain, runStreamCli } from '@openuji/cli-kit';
import { base64ByteLength } from '@openuji/core';
import { createCompositorStream } from '@openuji/stream-compositor';

/** Standalone compositor stream: live frame metrics, no disk writes. */
runMain(async () => {
  await runStreamCli({
    label: 'standalone compositor stream',
    ready: 'Page loaded. Scroll or interact. Press Ctrl+C to stop.\n',
    waitUntil: 'domcontentloaded',
    run: async (target) => {
      console.log('Starting compositor stream...');
      const { frames, stop } = await createCompositorStream(target.cdp, {
        viewport: target.viewport,
      });

      const consumed = (async () => {
        const startTime = target.cdp.clock.now();
        for await (const frame of frames) {
          const elapsedMs = (frame.receivedAtMs - startTime).toFixed(0);
          const sizeKb = (base64ByteLength(frame.base64) / 1024).toFixed(1);

          console.log(
            `[Frame #${String(frame.index).padStart(4, '0')}] ` +
              `+${elapsedMs.padStart(5, ' ')}ms | ` +
              `size: ${sizeKb.padStart(6, ' ')} KB | ` +
              `scroll: (${frame.scrollX}, ${frame.scrollY}) | ` +
              `viewport: ${frame.viewportWidth}x${frame.viewportHeight} @${frame.pageScaleFactor}x`,
          );
        }
      })();

      return { consumed, stop };
    },
  });
});
