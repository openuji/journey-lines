import puppeteer from 'puppeteer';
import { defineConfig } from 'wxt';
import { workspaceAliases } from '../../workspace-aliases';

const startUrl = process.env['UXR_START_URL'];

// The Chrome for Testing build Puppeteer is pinned to. Branded Chrome has
// ignored `--load-extension` since 137.
const chromeForTesting = await puppeteer.executablePath();

export default defineConfig({
  srcDir: 'src',
  // No auto-imports: every file names what it uses.
  imports: false,
  modules: ['@wxt-dev/module-react'],

  // Workspace packages bundle from their TypeScript sources, so breakpoints
  // land in the packages' own code. WXT also adds these to `.wxt/tsconfig.json`.
  alias: workspaceAliases,

  manifest: {
    name: 'OpenUJI Recorder',
    description: 'Records a UX journey in your own tab and shows it as it happens.',
    // `debugger` records the tab; `tabs` reads its title and URL; `sidePanel`
    // is where the journey shows.
    permissions: ['sidePanel', 'debugger', 'tabs'],
    action: { default_title: 'OpenUJI Recorder' },
  },

  // Readable output, also in `wxt build`: what you load unpacked is what you debug.
  vite: () => ({
    build: { minify: false, sourcemap: true },
  }),

  // A fresh profile every run. A kept one would also keep the first service
  // worker it installed: Chrome 154 re-reads an unpacked extension's manifest
  // on launch, but not its worker script, so later runs execute stale code.
  webExt: {
    binaries: { chrome: chromeForTesting },
    ...(startUrl ? { startUrls: [startUrl] } : {}),
  },
});
