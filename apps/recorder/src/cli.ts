#!/usr/bin/env node
import { installShutdown, runMain, targetUrlFromArgv } from '@openuji/cli-kit';
import { StreamWatchSession } from './session.js';

runMain(async () => {
  const session = new StreamWatchSession({ url: targetUrlFromArgv() });

  await session.start();

  console.log('\nReady! Full UXR recording is active:');
  console.log(
    session.recordsVideo
      ? '  • Scroll the page               -> 03-pre-scroll + 04-post-scroll + path + .webm with its trace'
      : '  • Scroll the page               -> 03-pre-scroll + 04-post-scroll + path (UXR_VIDEO=1 adds a video)',
  );
  console.log(
    session.recordsVideo
      ? '  • Click any element             -> 10-pre-click (before the press) + 11-post-click (at rest) + DOM metadata + .webm'
      : '  • Click any element             -> 10-pre-click (before the press) + 11-post-click (at rest) + DOM metadata',
  );
  console.log('  • Navigate or press Ctrl+C      -> 99-before-navigation');
  console.log('  • Switch tabs                   -> the active tab is recorded');
  console.log(`  • Logs recorded in real time to -> ${session.ndjsonPath}\n`);

  await new Promise<void>((resolve, reject) => {
    const chrome = session.browserHandle;
    if (!chrome) {
      reject(new Error('Session started without a browser'));
      return;
    }

    installShutdown({ onClosed: chrome.tabs.onGone }, async () => {
      try {
        await session.stop();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
});
