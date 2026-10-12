import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip, storyTransitionFrames } from '../../stories/media';
import { ClipRange } from '../ClipRange/ClipRange';
import { FramePair } from './FramePair';

const meta = {
  title: 'Media/Frame pair',
  component: FramePair,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: {
    before: storyTransitionFrames[0]!,
    after: storyTransitionFrames[1]!,
    children: <ClipRange clip={storyTransitionClip} />,
  },
} satisfies Meta<typeof FramePair>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};
export const MissingBefore: Story = {
  args: { before: { ...storyTransitionFrames[0]!, src: undefined } },
};
export const ExpandedAfter: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('[aria-label="Expand after frame"]')?.click();
  },
};
