import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { storyPlayableTransitionClip, storyTransitionFrames } from '../../stories/media';
import { ClipFilmstrip } from '../ClipFilmstrip/ClipFilmstrip';
import { FramePair } from './FramePair';

const meta = {
  title: 'Media/Frame pair',
  component: FramePair,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: {
    before: storyTransitionFrames[0]!,
    after: storyTransitionFrames[1]!,
    expanded: null,
    controlsId: 'frame-pair-story-showcase',
    onToggle: fn(),
    children: <ClipFilmstrip clip={storyPlayableTransitionClip} previewEnabled />,
  },
} satisfies Meta<typeof FramePair>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};
export const WithoutTransition: Story = { args: { children: null } };
export const MissingBefore: Story = {
  args: { before: { ...storyTransitionFrames[0]!, src: undefined } },
};
/** The after frame is the one shown large by the host. */
export const AfterExpanded: Story = { args: { expanded: 'after' } };
