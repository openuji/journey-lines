import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip } from '@openuji/journey/fixtures';
import { ClipFrameVideo } from './ClipFrameVideo';

const meta = {
  title: 'Media/Clip frame',
  component: ClipFrameVideo,
  decorators: [(Story) => <div className="story-surface"><div style={{ display: 'flex', width: 'var(--ds-preview-width)', height: 'var(--ds-story-preview-height)' }}><Story /></div></div>],
  args: { source: `data:${storyTransitionClip.mimeType};base64,${storyTransitionClip.base64}`, seconds: 0.0005 },
} satisfies Meta<typeof ClipFrameVideo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initial: Story = {};
export const Intermediate: Story = { args: { seconds: 0.1205 } };
export const Final: Story = { args: { seconds: 0.6005 } };
export const Unavailable: Story = { args: { source: `data:video/webm;base64,${btoa('invalid video')}` } };
