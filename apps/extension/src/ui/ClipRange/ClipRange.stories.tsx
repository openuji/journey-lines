import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip } from '../../stories/media';
import { ClipRange } from './ClipRange';

const meta = {
  title: 'Media/Clip range',
  component: ClipRange,
  decorators: [(Story) => <div className="story-surface"><div style={{ width: 'var(--ds-story-range-width)', marginTop: 'var(--ds-story-range-offset)' }}><Story /></div></div>],
  args: { clip: storyTransitionClip },
} satisfies Meta<typeof ClipRange>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {};
export const WithoutVideo: Story = { args: { clip: undefined } };
export const StillVideo: Story = { args: { clip: { ...storyTransitionClip, trace: storyTransitionClip.trace.slice(0, 1) } } };
export const KeyboardPreview: Story = {
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLInputElement>('input')?.focus(),
};
