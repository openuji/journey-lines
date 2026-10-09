import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { defineConfig } from 'wxt';
import { workspaceAliases } from '../../workspace-aliases';

const startUrl = process.env['UXR_START_URL'];

// The Chrome for Testing build Puppeteer is pinned to. Branded Chrome has
// ignored `--load-extension` since 137.
const chromeForTesting = await puppeteer.executablePath();

// The video encoder's libav.js build, served from `/libav` (see
// `entrypoints/offscreen/clip-worker.ts`).
const LIBAV = fileURLToPath(new URL('../../packages/clip-webm/vendor/libav/', import.meta.url));
const libavFiles = readdirSync(LIBAV).filter((file) => /\.(mjs|wasm)$/.test(file));

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
    icons: {
      16: 'icons/action-16.png',
      32: 'icons/action-32.png',
      48: 'icons/action-48.png',
      128: 'icons/action-128.png',
    },
    // `debugger` records the tab; `tabs` reads its title and URL; `sidePanel`
    // is where the journey shows; `offscreen` hosts the video encoder's worker.
    permissions: ['sidePanel', 'debugger', 'tabs', 'offscreen'],
    // Chrome's default extension CSP forbids compiling WebAssembly, which the
    // video encoder is. WXT adds this only in dev, so it is set here for builds.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    action: {
      default_title: 'OpenUJI Recorder',
      default_icon: {
        16: 'icons/action-16.png',
        24: 'icons/action-24.png',
        32: 'icons/action-32.png',
      },
    },
  },

  // Readable output, also in `wxt build`: what you load unpacked is what you debug.
  // Workers as ES modules: libav.js loads its WebAssembly glue with `import()`.
  vite: () => ({
    build: { minify: false, sourcemap: true },
    worker: { format: 'es' },
  }),

  hooks: {
    'build:publicAssets': (_wxt, files) => {
      for (const file of libavFiles) {
        files.push({ absoluteSrc: `${LIBAV}${file}`, relativeDest: `libav/${file}` });
      }
    },
  },

  // A fresh profile every run. A kept one would also keep the first service
  // worker it installed: Chrome 154 re-reads an unpacked extension's manifest
  // on launch, but not its worker script, so later runs execute stale code.
  webExt: {
    binaries: { chrome: chromeForTesting },
    ...(startUrl ? { startUrls: [startUrl] } : {}),
  },
});
