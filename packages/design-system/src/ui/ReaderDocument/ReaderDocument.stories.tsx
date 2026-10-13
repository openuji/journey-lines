import type { Meta, StoryObj } from '@storybook/react-vite';
import { journeyEntry } from '@openuji/journey';
import { campusReport, mostlyUnnotedReport, untitledReport } from '@openuji/journey/fixtures';
import { storyMedia } from '../../stories/media';
import { ReaderDocument } from './ReaderDocument';

const meta = {
  title: 'Report/Reader document',
  component: ReaderDocument,
  args: { entry: journeyEntry(campusReport), media: storyMedia(campusReport) },
  argTypes: { entry: { control: false }, media: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReaderDocument>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The reading surface on its own, as the editor's Preview shows it. */
export const CampusJourney: Story = {};

export const MostlyUnnoted: Story = {
  args: { entry: journeyEntry(mostlyUnnotedReport), media: storyMedia(mostlyUnnotedReport) },
};

/** A single section: no contents to show. */
export const SingleSection: Story = {
  args: { entry: journeyEntry(untitledReport), media: storyMedia(untitledReport) },
};

/** A picture or video that is not (yet) there. */
export const MissingMedia: Story = {
  args: { media: {} },
};
