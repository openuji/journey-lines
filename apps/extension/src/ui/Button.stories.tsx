import type { Meta, StoryObj } from '@storybook/react-vite';
import { Square } from 'lucide-react';
import { Button } from './Button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: {
    children: 'Record',
    variant: 'primary',
    size: 'default',
  },
  argTypes: {
    variant: { control: 'radio', options: ['primary', 'secondary', 'quiet'] },
    size: { control: 'radio', options: ['small', 'default'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Primary: Story = {};

export const Secondary: Story = {
  args: { children: 'Done', variant: 'secondary', size: 'small' },
};

export const Quiet: Story = {
  args: { children: 'Dismiss', variant: 'quiet', size: 'small' },
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Square size={12} fill="currentColor" />
        Stop
      </>
    ),
    variant: 'secondary',
    size: 'small',
  },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Finishing…' },
};

export const AllStates: Story = {
  render: () => (
    <div className="story-cluster">
      <Button variant="primary">Record</Button>
      <Button>Secondary</Button>
      <Button variant="quiet" size="small">Quiet</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};
