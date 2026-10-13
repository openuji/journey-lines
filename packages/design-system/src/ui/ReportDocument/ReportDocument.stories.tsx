import { useReducer } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { emptyDraft, reportReducer, type JourneyEvent, type ReportDraft } from '@openuji/journey';
import {
  campusDraft,
  campusEvents,
  longEvents,
  longTextDraft,
  manyPhasesDraft,
  phaseAllHiddenDraft,
  ungroupedLeadDraft,
} from '@openuji/journey/fixtures';
import { ReportBar } from '../ReportBar/ReportBar';
import { ReportDocument } from './ReportDocument';
// The report page's column, borrowed to frame the document.
import pageStyles from '../ReportView/ReportView.module.css';

/** Story-only page: holds the draft, as the report editor does. How it reads is in Report/Reader. */
function ReportPlayground({ events, draft }: { events: readonly JourneyEvent[]; draft: ReportDraft }) {
  const [current, dispatch] = useReducer(reportReducer, draft);
  return (
    <>
      <ReportBar title="Report editor" />
      <main className={pageStyles['report-doc']}>
        <ReportDocument events={events} draft={current} onEdit={dispatch} />
      </main>
    </>
  );
}

const meta = {
  title: 'Report/Editor',
  component: ReportPlayground,
  args: { events: campusEvents, draft: campusDraft },
  argTypes: {
    events: { control: false },
    draft: { control: false },
  },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof ReportPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Hörsaal journey from changes/intent.md, with nothing written yet. */
export const EmptyTemplate: Story = {
  args: { draft: emptyDraft },
};

/** Filled as in changes/overfitted-report.md. */
export const CampusJourney: Story = {};

export const NoSteps: Story = {
  args: { events: [] },
};

/** Phases begin at Google; the course page stays ungrouped above them. */
export const UngroupedLead: Story = {
  args: { draft: ungroupedLeadDraft },
};

/** The Maps phase keeps its texts, but every step in it is hidden. */
export const PhaseAllHidden: Story = {
  args: { draft: phaseAllHiddenDraft },
};

export const LongTexts: Story = {
  args: { draft: longTextDraft },
};

/** 44 captures over four views, a phase at each. */
export const ManyPhases: Story = {
  args: { events: longEvents, draft: manyPhasesDraft },
};

export const Narrow: Story = {
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};
