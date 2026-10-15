import { fileURLToPath } from 'node:url';

const pkg = (relative: string): string =>
  fileURLToPath(new URL(relative, import.meta.url));

/**
 * Every workspace package resolved to its TypeScript sources, not its `dist`.
 *
 * Tests run against sources so `pnpm test` needs no prior build (beyond the
 * generated browser sources), and the extension bundles them so DevTools shows
 * the packages' own TypeScript. Subpaths come before their package: a string
 * alias also matches `<alias>/...`, and the first match wins.
 */
export const workspaceAliases: Record<string, string> = {
  '@journey-lines/cdp/testing': pkg('./packages/cdp/src/testing.ts'),
  '@journey-lines/cdp': pkg('./packages/cdp/src/index.ts'),
  '@journey-lines/clip-webm': pkg('./packages/clip-webm/src/index.ts'),
  '@journey-lines/client-probe': pkg('./packages/client/probe/src/index.ts'),
  '@journey-lines/core/wire': pkg('./packages/core/src/wire.ts'),
  '@journey-lines/core': pkg('./packages/core/src/index.ts'),
  '@journey-lines/design-system/storybook': pkg('./packages/design-system/src/stories/preview.tsx'),
  '@journey-lines/design-system/styles.css': pkg('./packages/design-system/src/styles/styles.css'),
  '@journey-lines/design-system': pkg('./packages/design-system/src/index.ts'),
  '@journey-lines/engine': pkg('./packages/engine/src/index.ts'),
  '@journey-lines/fused': pkg('./packages/fused/src/index.ts'),
  '@journey-lines/host-extension': pkg('./packages/host-extension/src/index.ts'),
  '@journey-lines/host-puppeteer': pkg('./packages/host-puppeteer/src/index.ts'),
  '@journey-lines/journey/fixtures': pkg('./packages/journey/src/fixtures/index.ts'),
  '@journey-lines/journey': pkg('./packages/journey/src/index.ts'),
  '@journey-lines/privacy': pkg('./packages/privacy/src/index.ts'),
  '@journey-lines/rules-document': pkg('./packages/rules-document/src/index.ts'),
  '@journey-lines/rules-interaction': pkg('./packages/rules-interaction/src/index.ts'),
  '@journey-lines/sinks': pkg('./packages/sinks/src/index.ts'),
  '@journey-lines/stream-compositor': pkg('./packages/stream-compositor/src/index.ts'),
  '@journey-lines/stream-probe': pkg('./packages/stream-probe/src/index.ts'),
  '@journey-lines/stream-lifecycle': pkg('./packages/stream-lifecycle/src/index.ts'),
  '@journey-lines/stream-html': pkg('./packages/stream-html/src/index.ts'),
  '@journey-lines/stream-pdf': pkg('./packages/stream-pdf/src/index.ts'),
};
