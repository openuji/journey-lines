#!/usr/bin/env node
import { runMain, runStreamCli } from '@openuji/cli-kit';
import { createInteractionStream } from '@openuji/stream-interaction';

/** Standalone interaction stream: live DOM inspection of clicks, and the page's own scrolling. */
runMain(async () => {
  await runStreamCli({
    label: 'standalone interaction probe',
    ready:
      'Page ready. Click elements or scroll to see what the page reports. Press Ctrl+C to stop.\n',
    run: async (target) => {
      console.log('Attaching interaction probe...');
      const { events, stop } = await createInteractionStream(target.cdp);

      const consumed = (async () => {
        for await (const event of events) {
          if (event.type === 'scroll-cause') {
            console.log(`\x1b[36m[SCROLL CAUSE]\x1b[0m ${event.kind}${event.detail ? ` ${event.detail}` : ''}`);
            continue;
          }
          if (event.type === 'page-scroll' || event.type === 'page-position') {
            const kind = event.type === 'page-position' ? 'PAGE AT' : event.ended ? 'PAGE SCROLL END' : 'PAGE SCROLL';
            console.log(`\x1b[36m[${kind}]\x1b[0m (${Math.round(event.x)}, ${Math.round(event.y)})`);
            continue;
          }
          const { action, target } = event;
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
