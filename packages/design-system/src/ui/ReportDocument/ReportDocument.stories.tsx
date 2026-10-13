import { useReducer, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  emptyDraft,
  reportReducer,
  type JourneyEvent,
  type ReportDraft,
  type ReportMode,
} from '@openuji/journey';
import {
  campusDraft,
  campusEvents,
  longEvents,
  longTextDraft,
  manyPhasesDraft,
  phaseAllHiddenDraft,
  ungroupedLeadDraft,
} from '@openuji/journey/fixtures';
import { Button } from '../Button/Button';
import { ReportBar } from '../ReportBar/ReportBar';
import { ReportDocument } from './ReportDocument';
// The report page's column, borrowed to frame the document.
import pageStyles from '../ReportView/ReportView.module.css';

/** Story-only page: holds the draft and the mode, as the report editor does. */
function ReportPlayground({ events, draft, mode: initialMode }: {
  events: readonly JourneyEvent[];
  draft: ReportDraft;
  mode: ReportMode;
}) {
  const [current, dispatch] = useReducer(reportReducer, draft);
  const [mode, setMode] = useState(initialMode);
  return (
    <>
      <ReportBar recording={null} steps={events.length}>
        <Button size="small" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
          {mode === 'edit' ? 'Preview' : 'Edit'}
        </Button>
      </ReportBar>
      <main className={pageStyles['report-doc']}>
        <ReportDocument events={events} draft={current} onEdit={mode === 'edit' ? dispatch : undefined} />
      </main>
    </>
  );
}

const meta = {
  title: 'Report/Editor',
  component: ReportPlayground,
  args: { events: campusEvents, draft: campusDraft, mode: 'edit' },
  argTypes: {
    events: { control: false },
    draft: { control: false },
    mode: { control: 'inline-radio', options: ['edit', 'preview'] },
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

/** What FU support would read. */
export const CampusJourneyPreview: Story = {
  args: { mode: 'preview' },
};

/** Nothing written: a reader sees only the steps. */
export const EmptyPreview: Story = {
  args: { draft: emptyDraft, mode: 'preview' },
};

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

export const PhaseAllHiddenPreview: Story = {
  args: { draft: phaseAllHiddenDraft, mode: 'preview' },
};

export const LongTexts: Story = {
  args: { draft: longTextDraft },
};

export const LongTextsPreview: Story = {
  args: { draft: longTextDraft, mode: 'preview' },
};

/** 28 captures over four views, a phase at each. */
export const ManyPhases: Story = {
  args: { events: longEvents, draft: manyPhasesDraft },
};

export const Narrow: Story = {
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const NarrowPreview: Story = {
  args: { mode: 'preview' },
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};
