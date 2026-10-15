#!/usr/bin/env node
import { runMain, runStreamCli } from '@journey-lines/cli-kit';
import { startRecording } from '@journey-lines/fused';
import { ConsoleSink } from '@journey-lines/sinks';

/**
 * Fused detection mode: runs the full pipeline and prints every detected
 * milestone live, with zero disk I/O.
 */
runMain(async () => {
  await runStreamCli({
    label: 'fused stream detection mode',
    ready:
      '\nReady! Live detections will print in real time without writing to disk.\n' +
      'Press Ctrl+C to stop.\n',
    run: async (target) => {
      console.log('Starting fused stream...');
      const recording = await startRecording(target.cdp, {
        sinks: [new ConsoleSink()],
        screencast: { viewport: target.viewport },
      });

      return {
        // `stop` flushes the final resting state through the engine before the
        // streams shut down, so `99-before-navigation` still reports.
        stop: async () => {
          console.log('\nStopping fused stream...');
          await recording.stop();
        },
      };
    },
  });
});
