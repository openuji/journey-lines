import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyPlayableTransitionClip } from '../../stories/media';
import { ClipFilmstrip } from './ClipFilmstrip';

const meta = {
  title: 'Media/Clip filmstrip',
  component: ClipFilmstrip,
  decorators: [(Story) => (
    <div className="story-surface">
      <div style={{ width: 'var(--ds-story-filmstrip-width)', marginTop: 'var(--ds-story-preview-offset)' }}><Story /></div>
    </div>
  )],
  args: { clip: storyPlayableTransitionClip, previewEnabled: true },
} satisfies Meta<typeof ClipFilmstrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {};
export const PreviewDisabled: Story = { args: { previewEnabled: false } };
export const SingleFrame: Story = { args: { clip: { ...storyPlayableTransitionClip, trace: storyPlayableTransitionClip.trace.slice(0, 1) } } };
export const KeyboardPreview: Story = {
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('button')?.focus(),
};
