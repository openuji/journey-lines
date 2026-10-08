import type { Meta, StoryObj } from '@storybook/react-vite';
import { downloadReport } from '../../lib/report-download';
import {
  storyEmptyReport,
  storyLongReport,
  storyReport,
  storyReportWithClip,
} from '../../stories/report-sessions';
import { ReportView } from './ReportView';

const meta = {
  title: 'Report/Recording overview',
  component: ReportView,
  args: { session: storyReportWithClip, error: null, downloading: false },
  render: (args) => (
    <ReportView
      {...args}
      onDownload={() => { if (args.session) downloadReport(args.session); }}
    />
  ),
  // Fill the available Storybook canvas unless a story deliberately tests a fixed viewport.
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithScrollClip: Story = {};

export const CapturesOnly: Story = {
  args: { session: storyReport },
};

export const LongRecording: Story = {
  args: { session: storyLongReport },
};

export const Empty: Story = {
  args: { session: storyEmptyReport },
};

export const Unavailable: Story = {
  args: { session: null, error: 'Recording unavailable.' },
};

export const Loading: Story = {
  args: { session: null },
};

export const Narrow: Story = {
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};
