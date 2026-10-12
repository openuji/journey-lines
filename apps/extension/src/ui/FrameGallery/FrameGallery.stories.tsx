import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyGalleryFrames } from '../../stories/media';
import { FrameGallery } from './FrameGallery';

const meta = {
  title: 'Media/Frame gallery',
  component: FrameGallery,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { frames: storyGalleryFrames },
} satisfies Meta<typeof FrameGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeAndAfter: Story = {};
export const SingleFrame: Story = { args: { frames: [storyGalleryFrames[0]!] } };
export const MissingBefore: Story = {
  args: { frames: [{ ...storyGalleryFrames[0]!, src: undefined }, storyGalleryFrames[1]!] },
};
export const ExpandedFrame: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('[aria-label="Expand before frame"]')?.click();
  },
};
