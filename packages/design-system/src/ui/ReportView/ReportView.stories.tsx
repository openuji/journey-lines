import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  campusDraft,
  campusRecording,
  storyEmptyReport,
  storyLongReport,
  storyReport,
  storyReportWithClip,
} from '@openuji/journey/fixtures';
import { ReportView } from './ReportView';

const meta = {
  title: 'Report/Recording overview',
  component: ReportView,
  // Saving the archive is the host's side effect; here the action log shows the draft it would save.
  args: { session: storyReportWithClip, error: null, downloading: false, onDownload: fn() },
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
