import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip } from '../../stories/media';
import { ClipVideo } from './ClipVideo';

const meta = {
  title: 'Media/Clip video',
  component: ClipVideo,
  decorators: [(Story) => <div className="story-surface story-video"><Story /></div>],
  args: { clip: storyTransitionClip, className: 'story-video__player' },
} satisfies Meta<typeof ClipVideo>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Paused: Story = {};
