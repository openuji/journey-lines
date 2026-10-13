import { describe, expect, it } from 'vitest';
import { campusDraft, campusRecording, phaseAllHiddenDraft, ungroupedLeadDraft } from '../src/fixtures/index.js';
import { journeyEntry } from '../src/journey-entry.js';
import { REPORT_VERSION, type ReportExport } from '../src/report-archive.js';
import { emptyDraft, type ReportDraft } from '../src/report-draft.js';
import { journeyTemplate } from '../src/report-template.js';

const entryOf = (draft: ReportDraft) => journeyEntry({
  version: REPORT_VERSION,
  template: journeyTemplate,
  draft,
  recording: campusRecording,
} satisfies ReportExport);

describe('journey entry', () => {
  it('holds what a reader of the report sees, as plain text', () => {
    const entry = entryOf(campusDraft);
    expect(entry).toMatchObject({
      version: 1,
      id: 'ses_campus',
      title: 'Where is my lecture hall, actually?',
      page: { title: campusRecording.meta.tab.title, url: campusRecording.meta.tab.url },
      startedAtMs: campusRecording.meta.startedAtMs,
      endedAtMs: campusRecording.meta.endedAtMs,
    });
    expect(entry.fields.map((field) => field.id)).toEqual(['subject', 'title', 'goal', 'result', 'insight', 'idea', 'scope']);
    expect(entry.fields[2]).toEqual({ id: 'goal', kind: 'statement', label: 'My goal', text: campusDraft.fields['goal'] });
    expect(entry.phases.map((phase) => phase.title)).toEqual([
      'I find an address',
      'I search for the lecture hall',
      'I try to orient myself with Maps',
    ]);
  });

  it('files each visible step under its phase and leaves hidden ones out', () => {
    const { steps } = entryOf(campusDraft);
    expect(steps.map((step) => `${step.phase}:${step.key}`)).toEqual([
      '1:page:1', '1:scroll:1:01',
      '2:page:2', '2:click:2:01', '2:page:3', '2:scroll:3:01', '2:scroll:3:02',
      '3:page:4', '3:click:4:01', '3:click:4:02', '3:exit:4',
    ]);
    expect(steps[1]).toMatchObject({ kind: 'scroll', note: 'The address is the only hint at where the course takes place.' });
  });

  it('keeps steps before the first phase outside any phase', () => {
    const { steps, phases } = entryOf(ungroupedLeadDraft);
    expect(steps.slice(0, 2).map((step) => [step.key, step.phase])).toEqual([['page:1', null], ['scroll:1:01', null]]);
    expect(phases.map((phase) => phase.number)).toEqual([1, 2]);
  });

  it('keeps a written phase whose steps are all hidden, without their notes', () => {
    const entry = entryOf(phaseAllHiddenDraft);
    expect(entry.phases.at(-1)?.title).toBe('I try to orient myself with Maps');
    expect(entry.steps.some((step) => step.phase === 3)).toBe(false);
    expect(JSON.stringify(entry)).not.toContain('A note on a hidden step.');
  });

  it('is called after the page it started on until a title is written', () => {
    expect(entryOf(emptyDraft)).toMatchObject({ title: campusRecording.meta.tab.title, fields: [], phases: [] });
    expect(entryOf({ ...campusDraft, fields: { ...campusDraft.fields, title: '   ' } }).title).toBe(campusRecording.meta.tab.title);
    expect(entryOf(emptyDraft).steps.every((step) => step.phase === null)).toBe(true);
  });

  it('survives JSON unchanged, as a store keeps it', () => {
    const entry = entryOf(campusDraft);
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  });
});
