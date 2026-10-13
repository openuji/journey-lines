import type { Meta, StoryObj } from '@storybook/react-vite';
import { journeyTemplate, REPORT_VERSION } from '@openuji/journey';
import { campusReport, longTextReport, storyEmptyReport, untitledReport } from '@openuji/journey/fixtures';
import { ReportReader } from './ReportReader';

const meta = {
  title: 'Report/Reader',
  component: ReportReader,
  args: { report: campusReport, error: null, back: { href: '#journeys', label: 'Journeys' } },
  argTypes: { report: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportReader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What FU support reads: the written report, hidden steps left out. */
export const CampusJourney: Story = {};

/** Downloaded before anything was written: only the steps. */
export const Untitled: Story = {
  args: { report: untitledReport },
};

export const LongTexts: Story = {
  args: { report: longTextReport },
};

export const NoSteps: Story = {
  args: { report: { version: REPORT_VERSION, template: journeyTemplate, draft: campusReport.draft, recording: storyEmptyReport } },
};

export const Loading: Story = {
  args: { report: null },
};

export const Unavailable: Story = {
  args: { report: null, error: 'This journey’s report could not be read.' },
};

/** Opened on its own, with nowhere to go back to. */
export const WithoutBack: Story = {
  args: { back: undefined },
};

export const Narrow: Story = {
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};
