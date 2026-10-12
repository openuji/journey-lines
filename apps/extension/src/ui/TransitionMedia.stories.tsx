import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip, storyTransitionFrames } from '../stories/media';
import { TransitionMedia } from './TransitionMedia';

const meta = {
  title: 'Media/Transition',
  component: TransitionMedia,
  decorators: [(Story) => <div className="story-surface"><div style={{ maxWidth: 440, marginTop: 200 }}><Story /></div></div>],
  args: { frames: storyTransitionFrames, clip: storyTransitionClip },
} satisfies Meta<typeof TransitionMedia>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {};
export const WithoutVideo: Story = { args: { clip: undefined } };
export const MissingBefore: Story = { args: { frames: [{ ...storyTransitionFrames[0]!, src: undefined }, storyTransitionFrames[1]!] } };
export const ExpandedFrame: Story = {
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('[aria-label="Expand before frame"]')?.click(),
};
