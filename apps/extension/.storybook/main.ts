import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import { workspaceAliases } from '../../../workspace-aliases.js';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      resolve: { alias: workspaceAliases },
    });
  },
};

export default config;
