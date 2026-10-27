import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { ExtensionSettings } from '../../lib/settings';
import { ExtensionTranslationProvider } from '../../localisation/TranslationProvider';
import { createStorySettings, storySettings } from '../../stories/settings';
import { Settings } from './Settings';

function SettingsPreview({ initial = storySettings }: { initial?: ExtensionSettings }) {
  const [storage] = useState(() => createStorySettings(initial));
  return <Settings storage={storage} />;
}

const meta = {
  title: 'Panel/Settings',
  component: Settings,
  decorators: [(Story) => <ExtensionTranslationProvider language="en"><Story /></ExtensionTranslationProvider>],
  render: () => <SettingsPreview />,
} satisfies Meta<typeof Settings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {};
export const LongerWaits: Story = {
  render: () => <SettingsPreview initial={{ ...storySettings, click: { quietAfterMs: 1000, stillMovingMs: 5000 } }} />,
};
export const ValidationError: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pause = await canvas.findByLabelText('Visual pause before ending a click (seconds)');
    await waitFor(() => expect(pause).toBeEnabled());
    await userEvent.clear(pause);
    await userEvent.type(pause, '3');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('at least as long as the visual pause');
  },
};
export const Loading: Story = {
  render: () => <Settings storage={loadingStorage} />,
};
const loadingStorage = { ...createStorySettings(), load: () => new Promise<ExtensionSettings>(() => {}) };
export const German: Story = {
  decorators: [(Story) => <ExtensionTranslationProvider language="de"><Story /></ExtensionTranslationProvider>],
};
export const Narrow: Story = {
  globals: { viewport: { value: 'panelNarrow', isRotated: false } },
};
