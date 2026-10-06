#!/usr/bin/env node
import { runMain, runStreamCli } from '@openuji/cli-kit';
import { createInteractionStream } from '@openuji/stream-interaction';

/** Standalone interaction stream: live DOM inspection of clicks. */
runMain(async () => {
  await runStreamCli({
    label: 'standalone interaction probe',
    ready:
      'Page ready. Click elements to see live DOM inspection. Press Ctrl+C to stop.\n',
    run: async (target) => {
      console.log('Attaching interaction probe...');
      const { events, stop } = await createInteractionStream(target.cdp);

      const consumed = (async () => {
        for await (const { action, target } of events) {
          console.log(
            `\x1b[35m[INTERACTION: ${action.toUpperCase()}]\x1b[0m ` +
              `<${target.selector}> "${target.textSnippet ?? ''}" ` +
              `role:${target.role ?? '-'} at:(${target.clientX}, ${target.clientY}) ` +
              `rect:[${target.boundingRect.width}x${target.boundingRect.height}]`,
          );
        }
      })();

      return { consumed, stop };
    },
  });
});
