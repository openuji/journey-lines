import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/Button';
import { ReportBar } from './ReportBar';

const meta = {
  title: 'Report/Bar',
  component: ReportBar,
  args: { title: 'Vorlesungsverzeichnis – Freie Universität Berlin', meta: '01:11 · 13 events' },
  argTypes: { leading: { control: false }, children: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {};

export const Loading: Story = {
  args: { title: 'Recording report', meta: undefined },
};

/** The editor's actions after the title. */
export const WithActions: Story = {
  args: {
    children: (
      <>
        <Button size="small">Preview</Button>
        <Button variant="primary" size="small">Download .zip</Button>
      </>
    ),
  },
};

export const Narrow: Story = {
  args: WithActions.args,
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};
