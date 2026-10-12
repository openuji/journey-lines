import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from './StatusBadge';

const meta = {
  title: 'Primitives/Status badge',
  component: StatusBadge,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { children: 'REC', tone: 'live' },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Live: Story = {};
export const Neutral: Story = { args: { children: 'Finishing…', tone: 'neutral', dot: false } };
