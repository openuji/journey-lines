import type { Meta, StoryObj } from '@storybook/react-vite';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

const meta = {
  title: 'Primitives/Icon button',
  component: IconButton,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { label: 'Dismiss', children: <X /> },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
