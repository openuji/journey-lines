import type { Meta, StoryObj } from '@storybook/react-vite';
import { journeyEntry, type ReportExport } from '@openuji/journey';
import { campusReport, longTextReport, mostlyUnnotedReport, untitledReport } from '@openuji/journey/fixtures';
import { storyMedia } from '../../stories/media';
import { ReportReader } from './ReportReader';

const published = (report: ReportExport) => ({ entry: journeyEntry(report), media: storyMedia(report) });

/** The campus report with nothing written after its last phase. */
const withoutConclusion: ReportExport = {
  ...campusReport,
  draft: { ...campusReport.draft, fields: { ...campusReport.draft.fields, insight: '', idea: '', scope: '' } },
};

const meta = {
  title: 'Report/Reader',
  component: ReportReader,
  args: { ...published(campusReport), back: { href: '#journeys', label: 'Journeys' } },
  argTypes: { entry: { control: false }, media: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportReader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What FU support reads: the written report, hidden steps left out. */
export const CampusJourney: Story = {};

/** Like a real first report: many steps, few notes, six phases. */
export const MostlyUnnoted: Story = {
  args: published(mostlyUnnotedReport),
};

/** Downloaded before anything was written: one section, so no contents. */
export const Untitled: Story = {
  args: published(untitledReport),
};

export const WithoutConclusion: Story = {
  args: published(withoutConclusion),
};

export const LongTexts: Story = {
  args: published(longTextReport),
};

/** Every step's time and address shown at once. */
export const DetailsShown: Story = {
  args: published(mostlyUnnotedReport),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
  },
};

/** Opened on its own, with nowhere to go back to. */
export const WithoutBack: Story = {
  args: { back: undefined },
};

/** The contents as a ruler; each phase's headline holds the top while it is read. */
export const Narrow: Story = {
  args: published(mostlyUnnotedReport),
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  args: published(mostlyUnnotedReport),
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};

export const German: Story = {
  args: { locale: { language: 'de', dir: 'ltr' }, back: { href: '#journeys', label: 'Zur Übersicht' } },
};

export const GermanNarrow: Story = {
  args: German.args,
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const EnglishRtl: Story = {
  args: { locale: { language: 'en', dir: 'rtl' } },
};

export const EnglishRtlNarrow: Story = {
  args: EnglishRtl.args,
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};
