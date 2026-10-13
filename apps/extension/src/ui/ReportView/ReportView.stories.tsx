import type { Meta, StoryObj } from '@storybook/react-vite';
import { REPORT_VERSION } from '../../lib/report-archive';
import { downloadReport } from '../../lib/report-download';
import { journeyTemplate } from '../../lib/report-template';
import { campusDraft, campusRecording } from '../../stories/campus-journey';
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
      onDownload={(draft) => {
        if (args.session) downloadReport({ version: REPORT_VERSION, template: journeyTemplate, draft, recording: args.session });
      }}
    />
  ),
  // Fill the available Storybook canvas unless a story deliberately tests a fixed viewport.
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithScrollClip: Story = {};

/** The journey from changes/intent.md, written up as in changes/overfitted-report.md. */
export const CampusJourney: Story = {
  args: { session: campusRecording, initialDraft: campusDraft },
};

export const CampusJourneyNarrow: Story = {
  args: { session: campusRecording, initialDraft: campusDraft },
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

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
