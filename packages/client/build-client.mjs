/**
 * Shared builder for the client (browser) tier.
 *
 * Every client package is authored as real, typechecked TypeScript but has to
 * reach the page as a *string*: CDP's `Page.addScriptToEvaluateOnNewDocument`
 * takes source text, not a module. So each package bundles to a self-contained
 * IIFE and re-exports it as a TS constant the Node side can import normally.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

/**
 * The wire contract is bundled from source: the probe is built before `tsc`
 * (`pnpm test` builds nothing else), so core's `dist` may be stale or absent.
 */
const WIRE_SOURCE = fileURLToPath(new URL('../core/src/wire.ts', import.meta.url));

/**
 * @param {object} options
 * @param {string} options.packageDir  Absolute path to the client package root.
 * @param {string} options.entry       Entry point, relative to packageDir.
 * @param {string} options.outBundle   IIFE bundle output, relative to packageDir.
 * @param {string} options.outModule   Generated TS module, relative to packageDir.
 * @param {string} options.exportName  Name of the exported source constant.
 */
export async function buildClientSource({
  packageDir,
  entry,
  outBundle,
  outModule,
  exportName,
}) {
  const bundlePath = resolve(packageDir, outBundle);
  const modulePath = resolve(packageDir, outModule);

  const result = await esbuild.build({
    entryPoints: [resolve(packageDir, entry)],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: false,
    legalComments: 'none',
    alias: { '@journey-lines/core/wire': WIRE_SOURCE },
    write: false,
  });

  const [output] = result.outputFiles ?? [];
  if (!output) {
    throw new Error(`esbuild produced no output for ${entry}`);
  }

  const source = output.text;

  await mkdir(dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, source, 'utf8');

  await mkdir(dirname(modulePath), { recursive: true });
  await writeFile(
    modulePath,
    [
      '// GENERATED FILE — do not edit.',
      `// Built from ${entry} by packages/client/build-client.mjs.`,
      '',
      `export const ${exportName} = ${JSON.stringify(source)};`,
      '',
    ].join('\n'),
    'utf8',
  );

  return { bytes: source.length, bundlePath, modulePath };
}
