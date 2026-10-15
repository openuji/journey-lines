import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatementTabs, type StatementTab } from './StatementTabs';

const happened: StatementTab = {
  label: 'What happens?',
  text: 'I search Google for the address and land on the official FU page for lecture hall 1b.',
};
const problem: StatementTab = {
  label: 'The problem',
  text: 'I found the right page, but it gives me no directions to the room that I can see.',
  tone: 'problem',
};

/** Opened as pointing at it would: the `index`th label takes the focus. */
const open = (index: number): Story['play'] => async ({ canvasElement }) => {
  canvasElement.querySelectorAll<HTMLElement>('button')[index]?.focus();
};

const meta = {
  title: 'Report/Statement tabs',
  component: StatementTabs,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { items: [happened, problem] },
} satisfies Meta<typeof StatementTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const HappenedOpen: Story = { play: open(0) };

/** The second label's tab sits over its panel, which still hangs from the first. */
export const ProblemOpen: Story = { play: open(1) };

/** Fewer words than labels: the panel is as wide as the labels, so the tab still sits on it. */
export const ShortText: Story = {
  args: { items: [happened, { ...problem, text: 'Nothing.' }] },
  play: open(1),
};

/** Only a problem was written. */
export const OnlyProblem: Story = {
  args: { items: [problem] },
  play: open(0),
};

/** More than the panel holds: it scrolls inside, nothing under it moves. */
export const LongTextOpen: Story = {
  args: {
    items: [happened, { ...problem, text: Array.from({ length: 8 }, () => 'The address names a place, but doesn’t explain how to find the room inside the building complex.').join('\n\n') }],
  },
  play: open(1),
};

export const Dark: Story = {
  play: open(1),
  globals: { colorMode: 'dark' },
};
