import type { Meta, StoryObj } from '@storybook/react-vite';
import { Statement } from './Statement';

const meta = {
  title: 'Report/Statement',
  component: Statement,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: {
    label: 'What happens?',
    children: 'I search Google for the address and land on the official FU page for lecture hall 1b.',
    tone: 'plain',
  },
  argTypes: { tone: { control: 'radio', options: ['plain', 'problem'] } },
} satisfies Meta<typeof Statement>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const Problem: Story = {
  args: { label: 'The problem', children: 'I found the right page, but it gives me no directions to the room that I can see.', tone: 'problem' },
};

export const LongText: Story = {
  args: {
    label: 'The problem',
    tone: 'problem',
    children: Array.from({ length: 4 }, () => 'The address names a place, but doesn’t explain how to find the room inside the building complex.').join('\n\n'),
  },
};

export const Dark: Story = {
  args: Problem.args,
  globals: { colorMode: 'dark' },
};
