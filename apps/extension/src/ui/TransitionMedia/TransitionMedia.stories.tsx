import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip, storyTransitionFrames } from '../../stories/media';
import { TransitionMedia } from './TransitionMedia';

const meta = {
  title: 'Media/Transition',
  component: TransitionMedia,
  decorators: [(Story) => (
    <div className="story-surface">
      <div style={{ maxWidth: 'var(--ds-story-journey-width)', marginTop: 'var(--ds-story-preview-offset)' }}>
        <Story />
      </div>
    </div>
  )],
  args: { before: storyTransitionFrames[0]!, after: storyTransitionFrames[1]!, clip: storyTransitionClip },
} satisfies Meta<typeof TransitionMedia>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {};
export const Playing: Story = {
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('[aria-label="Play video"]')?.click(),
};
export const WithoutVideo: Story = { args: { clip: undefined } };
export const MissingBefore: Story = { args: { before: { ...storyTransitionFrames[0]!, src: undefined } } };
export const ExpandedFrame: Story = {
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('[aria-label="Expand before frame"]')?.click(),
};
