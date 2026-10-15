#!/usr/bin/env node
import { runMain, runStreamCli } from '@journey-lines/cli-kit';
import { attachPrivacy, compilePrivacy } from '@journey-lines/privacy';
import { loadPrivacyDemoProfile, startPrivacyDemo } from './privacy-demo.js';

runMain(async () => {
  const program = compilePrivacy(loadPrivacyDemoProfile());
  const demo = await startPrivacyDemo();
  try {
    await runStreamCli({
      label: 'standalone privacy injection',
      targetUrl: demo.url,
      waitUntil: 'domcontentloaded',
      ready: 'The bundled profile has run. Check the rule counts above; follow the link or reload to see another pass. Ctrl+C to stop.',
      run: async (target) => {
        // The harness attaches before navigation; omit the blank document's diagnostics.
        let showingDemo = false;
        const privacy = await attachPrivacy(target.cdp, program, (diagnostic) => {
          if (!showingDemo) return;
          if (diagnostic.type === 'installed') console.log('privacy installed');
          else if (diagnostic.type === 'rule') {
            const log = diagnostic.level === 'warning' ? console.warn : console.log;
            log(`rule ${diagnostic.ruleId}: matched=${diagnostic.matched}, overwritten=${diagnostic.overwritten} (${diagnostic.status})`);
          } else console.log('privacy pass completed');
        });
        await privacy.ready;
        showingDemo = true;
        return { stop: privacy.dispose };
      },
    });
  } finally {
    await demo.close();
  }
});
