import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppWindow, ArrowDownUp, Globe, LogOut, MousePointerClick, Route, Square } from 'lucide-react';
import { storyClip, storyGalleryFrames, storyTransitionClip, storyTransitionFrames } from '../../stories/media';
import { TimelineRow } from './TimelineRow';

const meta = {
  title: 'Panel/Journey rows',
  component: TimelineRow,
  decorators: [(Story) => <div className="story-surface"><ol className="story-journey"><Story /></ol></div>],
  args: { time: '00:09', title: 'Click', icon: MousePointerClick, tone: 'click', frames: storyGalleryFrames },
  argTypes: { icon: { control: false }, clip: { control: false }, frames: { control: false } },
} satisfies Meta<typeof TimelineRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Click: Story = {};
export const ClickWithVideo: Story = { args: { frames: storyTransitionFrames, clip: storyTransitionClip } };
export const Scroll: Story = { args: { title: 'Scroll', icon: ArrowDownUp, tone: 'scroll', clip: storyClip } };
export const PageLoaded: Story = {
  args: {
    title: 'Page loaded', icon: Globe, tone: 'page',
    subtitle: { text: 'journey-lines.example/research/current?team=fu' },
    frames: [{ ...storyGalleryFrames[0]!, label: 'Page loaded', caption: undefined }],
  },
};
export const PageChanged: Story = { args: { ...PageLoaded.args, title: 'Page changed', icon: Route } };
export const SwitchedTab: Story = { args: { ...PageLoaded.args, title: 'Switched tab', icon: AppWindow } };
export const LeftPage: Story = {
  args: { title: 'Left page', icon: LogOut, tone: 'exit', frames: [{ ...storyGalleryFrames[0]!, label: 'Left page', caption: undefined }] },
};
export const RecordingEnded: Story = { args: { ...LeftPage.args, title: 'Recording ended', icon: Square } };
export const MissingBefore: Story = {
  args: { frames: [{ ...storyGalleryFrames[0]!, src: undefined }, storyGalleryFrames[1]!] },
};
export const ExpandedFrame: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('[aria-label="Expand before frame"]')?.click();
  },
};
