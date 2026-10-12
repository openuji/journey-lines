import type { Meta, StoryObj } from '@storybook/react-vite';
import { storyGalleryFrames } from '../../stories/media';
import { FrameThumbnail } from './FrameThumbnail';

const meta = {
  title: 'Media/Frame thumbnail',
  component: FrameThumbnail,
  decorators: [(Story) => <div className="story-surface"><Story /><div id="thumbnail-story-frame" hidden /></div>],
  args: {
    src: storyGalleryFrames[0]!.src,
    label: 'Before',
    expanded: false,
    controlsId: 'thumbnail-story-frame',
    onToggle: () => {},
  },
} satisfies Meta<typeof FrameThumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};
export const Selected: Story = { args: { expanded: true } };
export const Unavailable: Story = { args: { src: undefined } };
