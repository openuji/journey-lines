import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronRight, X } from 'lucide-react';
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

/** A main way on, such as previous and next. */
export const Large: Story = {
  args: { label: 'Next step', size: 'default', children: <ChevronRight /> },
};

export const Disabled: Story = {
  args: { label: 'Next step', size: 'default', disabled: true, children: <ChevronRight /> },
};
