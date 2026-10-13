import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { workspaceAliases } from '../../workspace-aliases';

export default defineConfig({
  integrations: [react()],
  vite: {
    // Workspace packages bundle from their TypeScript sources, as in the extension.
    // One React for the app and the design system's components.
    resolve: { alias: workspaceAliases, dedupe: ['react', 'react-dom'] },
  },
});
