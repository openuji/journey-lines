import type { Meta, StoryObj } from '@storybook/react-vite';
import { recordingEvents } from '@openuji/journey';
import { campusRecording } from '@openuji/journey/fixtures';
import { Button } from '../Button/Button';
import { ReportBar } from './ReportBar';

const meta = {
  title: 'Report/Bar',
  component: ReportBar,
  args: { recording: campusRecording, steps: recordingEvents(campusRecording).length },
  argTypes: { recording: { control: false }, leading: { control: false }, children: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {};

export const Loading: Story = {
  args: { recording: null, steps: 0 },
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
