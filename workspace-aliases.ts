import { fileURLToPath } from 'node:url';

const pkg = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url));

/**
 * Every workspace package resolved to its TypeScript sources, not its `dist`.
 *
 * Tests run against sources so `pnpm test` needs no prior build (beyond the
 * generated probe source), and the extension bundles them so DevTools shows
 * the packages' own TypeScript. Subpaths come before their package: a string
 * alias also matches `<alias>/...`, and the first match wins.
 */
export const workspaceAliases: Record<string, string> = {
  '@openuji/cdp/testing': pkg('./packages/cdp/src/testing.ts'),
  '@openuji/cdp': pkg('./packages/cdp/src/index.ts'),
  '@openuji/client-probe': pkg('./packages/client/probe/src/index.ts'),
  '@openuji/core/wire': pkg('./packages/core/src/wire.ts'),
  '@openuji/core': pkg('./packages/core/src/index.ts'),
  '@openuji/engine': pkg('./packages/engine/src/index.ts'),
  '@openuji/fused': pkg('./packages/fused/src/index.ts'),
  '@openuji/host-extension': pkg('./packages/host-extension/src/index.ts'),
  '@openuji/host-puppeteer': pkg('./packages/host-puppeteer/src/index.ts'),
  '@openuji/rules-document': pkg('./packages/rules-document/src/index.ts'),
  '@openuji/rules-interaction': pkg('./packages/rules-interaction/src/index.ts'),
  '@openuji/sinks': pkg('./packages/sinks/src/index.ts'),
  '@openuji/stream-compositor': pkg('./packages/stream-compositor/src/index.ts'),
  '@openuji/stream-interaction': pkg('./packages/stream-interaction/src/index.ts'),
  '@openuji/stream-lifecycle': pkg('./packages/stream-lifecycle/src/index.ts'),
};
