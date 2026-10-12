import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClientSource } from '../client/build-client.mjs';

const { bytes } = await buildClientSource({
  packageDir: dirname(fileURLToPath(import.meta.url)),
  entry: 'src/browser/install.ts',
  outBundle: 'dist/privacy.iife.js',
  outModule: 'src/generated/privacy-source.ts',
  exportName: 'PRIVACY_SOURCE',
});
console.log(`[privacy] bundled browser runtime (${bytes} bytes)`);
