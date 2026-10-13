import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyGalleryFrames, storyPlayableTransitionClip, storyTransitionFrames } from '../../stories/media';
import { StepMedia } from './StepMedia';

const meta = {
  title: 'Media/Step media',
  component: StepMedia,
  decorators: [(Story) => <div className="story-surface story-journey"><Story /></div>],
  args: { frames: [{ ...storyGalleryFrames[0]!, label: 'Page loaded', caption: undefined }] },
  argTypes: { frames: { control: false }, clip: { control: false } },
} satisfies Meta<typeof StepMedia>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A page or an exit: one frame. */
export const SingleFrame: Story = {};

/** An interaction: before and after, the clip between them. */
export const Transition: Story = {
  args: { frames: storyTransitionFrames, clip: storyPlayableTransitionClip },
};

/** An interaction recorded without video. */
export const TransitionWithoutClip: Story = {
  args: { frames: storyTransitionFrames },
};
