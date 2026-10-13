import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyPlayableTransitionClip, storyTransitionFrames } from '../../stories/media';
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
  args: { before: storyTransitionFrames[0]!, after: storyTransitionFrames[1]!, clip: storyPlayableTransitionClip },
} satisfies Meta<typeof TransitionMedia>;

export default meta;
type Story = StoryObj<typeof meta>;

const click = (canvas: HTMLElement, label: string) => canvas.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();

export const Recorded: Story = {};
export const Playing: Story = {
  play: async ({ canvasElement }) => click(canvasElement, 'Play video'),
};
export const WithoutVideo: Story = { args: { clip: undefined } };
export const MissingBefore: Story = { args: { before: { ...storyTransitionFrames[0]!, src: undefined } } };
export const ExpandedFrame: Story = {
  play: async ({ canvasElement }) => click(canvasElement, 'Expand before frame'),
};
/** One place shows things large: playing the clip replaces the expanded frame. */
export const FrameThenVideo: Story = {
  play: async ({ canvasElement }) => {
    click(canvasElement, 'Expand before frame');
    await new Promise((resolve) => setTimeout(resolve, 50));
    click(canvasElement, 'Play video');
  },
};
