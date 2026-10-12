import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlaybackToggle } from './PlaybackToggle';

const meta = {
  title: 'Media/Playback toggle',
  component: PlaybackToggle,
  decorators: [(Story) => <div className="story-surface"><Story /><div id="toggle-story-video" hidden /></div>],
  args: { playing: false, controlsId: 'toggle-story-video', onToggle: () => {} },
} satisfies Meta<typeof PlaybackToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Playing: Story = { args: { playing: true } };
