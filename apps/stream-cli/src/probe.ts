#!/usr/bin/env node
import { runMain, runStreamCli } from '@openuji/cli-kit';
import { createProbeStream } from '@openuji/stream-probe';

/** Standalone probe stream: live DOM inspection of clicks, the page's position, and what starts a scroll. */
runMain(async () => {
  await runStreamCli({
    label: 'standalone probe',
    ready:
      'Page ready. Click elements or scroll to see what the page reports. Press Ctrl+C to stop.\n',
    run: async (target) => {
      console.log('Attaching the probe...');
      const { events, stop } = await createProbeStream(target.cdp);

      const consumed = (async () => {
        for await (const event of events) {
          if (event.type === 'scroll-cause') {
            console.log(`\x1b[36m[SCROLL CAUSE]\x1b[0m ${event.kind}${event.detail ? ` ${event.detail}` : ''}`);
            continue;
          }
          if (event.type === 'press') {
            console.log(
              `\x1b[35m[PRESS]\x1b[0m ${event.kind}${event.detail ? ` ${event.detail}` : ''} ${event.pressId}` +
                (event.happenedAtMs === undefined ? ' (no Chrome time)' : ` at ${event.happenedAtMs.toFixed(1)}`),
            );
            continue;
          }
          if (event.type === 'press-ended') {
            console.log(`\x1b[35m[PRESS ENDED]\x1b[0m ${event.pressId}, no click`);
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
              `rect:[${target.boundingRect.width}x${target.boundingRect.height}]` +
              (event.pressId ? ` from press ${event.pressId}` : ' (no press)') +
              (event.trusted === false ? " by the page's own code" : ''),
          );
        }
      })();

      return { consumed, stop };
    },
  });
});
