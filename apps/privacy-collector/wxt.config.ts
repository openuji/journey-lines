import puppeteer from 'puppeteer';
import { defineConfig } from 'wxt';

const testHost = process.env['PRIVACY_COLLECTOR_TEST_HOST'];

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: {
    name: 'OpenUJI Privacy Collector',
    description: 'Collects reviewed privacy selectors into a UJG JSON-LD profile.',
    permissions: ['activeTab', 'scripting', 'storage', 'downloads', 'clipboardWrite'],
    ...(testHost ? { host_permissions: [testHost] } : {}),
    action: { default_title: 'Collect privacy selector' },
  },
  vite: () => ({ build: { minify: false, sourcemap: true } }),
  webExt: { binaries: { chrome: await puppeteer.executablePath() } },
});
