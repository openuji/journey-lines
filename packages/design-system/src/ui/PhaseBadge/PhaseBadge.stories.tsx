import type { Meta, StoryObj } from '@storybook/react-vite';
import { PhaseBadge } from './PhaseBadge';

const meta = {
  title: 'Report/Phase badge',
  component: PhaseBadge,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { number: 2, name: 'Phase' },
} satisfies Meta<typeof PhaseBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TwoDigits: Story = {
  args: { number: 12 },
};

/** As a map of phases lists them. */
export const Sequence: Story = {
  render: (args) => (
    <div className="story-cluster">
      {[1, 2, 3, 4, 5, 6].map((number) => <PhaseBadge key={number} {...args} number={number} />)}
    </div>
  ),
};

export const Dark: Story = {
  globals: { colorMode: 'dark' },
};
