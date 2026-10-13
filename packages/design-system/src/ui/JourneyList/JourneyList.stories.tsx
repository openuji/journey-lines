import type { Meta, StoryObj } from '@storybook/react-vite';
import { campusEntry, longTextEntry, storyEntries, untitledEntry } from '@openuji/journey/fixtures';
import { JourneyList } from './JourneyList';

const meta = {
  title: 'Journeys/List',
  component: JourneyList,
  args: { journeys: storyEntries, href: (id: string) => `#${id}` },
  argTypes: { journeys: { control: false }, href: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof JourneyList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Written up, untouched, and with long texts: newest first. */
export const Several: Story = {};

export const Empty: Story = {
  args: { journeys: [] },
};

/** The campus journey alone, as written in changes/overfitted-report.md. */
export const One: Story = {
  args: { journeys: [campusEntry] },
};

/** Downloaded before anything was written: called after its page, no subject, no phases. */
export const Untitled: Story = {
  args: { journeys: [untitledEntry] },
};

export const LongTexts: Story = {
  args: { journeys: [longTextEntry] },
};

export const Narrow: Story = {
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};
