import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyTransitionClip } from '@openuji/journey/fixtures';
import { ClipPlaybackPanel } from './ClipPlaybackPanel';

const meta = {
  title: 'Media/Playback panel',
  component: ClipPlaybackPanel,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { clip: storyTransitionClip, id: 'playback-story-video' },
} satisfies Meta<typeof ClipPlaybackPanel>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Playing: Story = {};
