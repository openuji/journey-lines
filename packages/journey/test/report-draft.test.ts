import { describe, expect, it } from 'vitest';
import { emptyDraft, reportOutline, reportReducer, type ReportDraft } from '../src/report-draft.js';
import { campusDraft, campusEvents, phaseAllHiddenDraft, ungroupedLeadDraft } from '../src/fixtures/index.js';

const keys = (steps: readonly { event: { key: string } }[]): string[] => steps.map((step) => step.event.key);

describe('report outline', () => {
  it('runs each phase from its step to the next phase, in recorded order', () => {
    const outline = reportOutline(campusDraft, campusEvents, 'edit');
    expect(outline.lead).toEqual([]);
    expect(outline.phases.map((phase) => [phase.at, phase.number])).toEqual([['page:1', 1], ['page:2', 2], ['page:4', 3]]);
    expect(keys(outline.phases[0]!.steps)).toEqual(['page:1', 'scroll:1:01', 'exit:1']);
    expect(keys(outline.phases[1]!.steps)).toEqual(['page:2', 'click:2:01', 'exit:2', 'page:3', 'scroll:3:01', 'scroll:3:02']);
    expect(keys(outline.phases[2]!.steps)).toEqual(['page:4', 'click:4:01', 'click:4:02', 'exit:4']);
  });

  it('keeps steps before the first phase ungrouped', () => {
    const outline = reportOutline(ungroupedLeadDraft, campusEvents, 'edit');
    expect(keys(outline.lead)).toEqual(['page:1', 'scroll:1:01', 'exit:1']);
    expect(outline.phases.map((phase) => phase.number)).toEqual([1, 2]);
  });

  it('shows hidden steps while editing and drops them for a reader', () => {
    expect(reportOutline(campusDraft, campusEvents, 'edit').phases[0]!.steps.at(-1)).toMatchObject({ hidden: true });
    expect(keys(reportOutline(campusDraft, campusEvents, 'preview').phases[0]!.steps)).toEqual(['page:1', 'scroll:1:01']);
  });

  it('keeps a phase with texts but no visible steps, and drops an empty one for a reader', () => {
    expect(reportOutline(phaseAllHiddenDraft, campusEvents, 'preview').phases.at(-1)).toMatchObject({ at: 'page:4', steps: [] });
    const blank: ReportDraft = { ...phaseAllHiddenDraft, phases: { ...phaseAllHiddenDraft.phases, 'page:4': { title: '  ' } } };
    expect(reportOutline(blank, campusEvents, 'preview').phases.map((phase) => [phase.at, phase.number]))
      .toEqual([['page:1', 1], ['page:2', 2]]);
    expect(reportOutline(blank, campusEvents, 'edit').phases).toHaveLength(3);
  });

  it('ignores a phase whose step is not in the recording', () => {
    const draft = reportReducer(emptyDraft, { type: 'startPhase', at: 'page:99' });
    expect(reportOutline(draft, campusEvents, 'edit')).toMatchObject({ phases: [] });
    expect(reportOutline(draft, campusEvents, 'edit').lead).toHaveLength(campusEvents.length);
  });
});

describe('report reducer', () => {
  it('starts a phase once, and removing it returns its steps to the phase before', () => {
    const started = reportReducer(campusDraft, { type: 'startPhase', at: 'page:3' });
    expect(reportReducer(started, { type: 'startPhase', at: 'page:3' })).toBe(started);
    expect(keys(reportOutline(started, campusEvents, 'edit').phases[2]!.steps)).toEqual(['page:3', 'scroll:3:01', 'scroll:3:02']);
    const removed = reportReducer(started, { type: 'removePhase', at: 'page:3' });
    expect(reportOutline(removed, campusEvents, 'edit')).toEqual(reportOutline(campusDraft, campusEvents, 'edit'));
  });

  it('writes fields, phase texts and step notes without touching the draft it was given', () => {
    let draft = reportReducer(emptyDraft, { type: 'setField', field: 'title', value: 'Where is my lecture hall?' });
    draft = reportReducer(draft, { type: 'startPhase', at: 'page:1' });
    draft = reportReducer(draft, { type: 'setPhase', at: 'page:1', field: 'problem', value: 'No directions.' });
    draft = reportReducer(draft, { type: 'setStepNote', at: 'click:2:01', note: 'The official result.' });
    draft = reportReducer(draft, { type: 'setStepHidden', at: 'click:2:01', hidden: true });
    expect(draft).toEqual({
      fields: { title: 'Where is my lecture hall?' },
      phases: { 'page:1': { problem: 'No directions.' } },
      steps: { 'click:2:01': { note: 'The official result.', hidden: true } },
    });
    expect(emptyDraft).toEqual({ fields: {}, phases: {}, steps: {} });
    expect(reportReducer(draft, { type: 'setPhase', at: 'page:2', field: 'title', value: 'x' })).toBe(draft);
  });
});
