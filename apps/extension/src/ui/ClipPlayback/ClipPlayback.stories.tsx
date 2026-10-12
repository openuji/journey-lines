import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyClip } from '../../stories/media';
import { ClipPlayback } from './ClipPlayback';

const meta = {
  title: 'Media/Clip playback',
  component: ClipPlayback,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { clip: storyClip },
} satisfies Meta<typeof ClipPlayback>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Playing: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('[aria-label="Play video"]')?.click();
  },
};
