import { describe, expect, it } from 'vitest';
import { campusDraft, campusRecording, phaseAllHiddenDraft, ungroupedLeadDraft } from '../src/fixtures/index.js';
import { entryFiles, journeyEntry } from '../src/journey-entry.js';
import { inlineMedia, mapEventMedia, recordingEvents } from '../src/journey-events.js';
import { itemFile, REPORT_VERSION, reportArtifacts, type ReportExport } from '../src/report-archive.js';
import { emptyDraft, type ReportDraft } from '../src/report-draft.js';
import { journeyTemplate } from '../src/report-template.js';

const report = (draft: ReportDraft): ReportExport =>
  ({ version: REPORT_VERSION, template: journeyTemplate, draft, recording: campusRecording });
const entryOf = (draft: ReportDraft) => journeyEntry(report(draft));

describe('journey entry', () => {
  it('holds what a reader of the report sees, as plain text', () => {
    const entry = entryOf(campusDraft);
    expect(entry).toMatchObject({
      version: 2,
      id: 'ses_campus',
      title: 'Where is my lecture hall, actually?',
      page: { title: campusRecording.meta.tab.title, url: campusRecording.meta.tab.url },
      startedAtMs: campusRecording.meta.startedAtMs,
      endedAtMs: campusRecording.meta.endedAtMs,
      phaseWording: { name: 'Phase', happened: 'What happens?', problem: 'The problem' },
    });
    expect(entry.intro.map((field) => field.id)).toEqual(['subject', 'title', 'goal', 'result']);
    expect(entry.conclusion.map((field) => field.id)).toEqual(['insight', 'idea', 'scope']);
    expect(entry.intro[2]).toEqual({ id: 'goal', kind: 'statement', label: 'My goal', text: campusDraft.fields['goal'] });
    expect(entry.phases.map((phase) => phase.title)).toEqual([
      'I find an address',
      'I search for the lecture hall',
      'I try to orient myself with Maps',
    ]);
  });

  it('files each visible step under its phase and leaves hidden ones out', () => {
    const { steps } = entryOf(campusDraft);
    expect(steps.map((step) => `${step.phase}:${step.event.key}`)).toEqual([
      '1:page:1', '1:scroll:1:01',
      '2:page:2', '2:click:2:01', '2:page:3', '2:scroll:3:01', '2:scroll:3:02',
      '3:page:4', '3:click:4:01', '3:click:4:02', '3:exit:4',
    ]);
    expect(steps[1]).toMatchObject({ event: { kind: 'scroll' }, note: 'The address is the only hint at where the course takes place.' });
  });

  it('names media by archive file, only for the steps it shows', () => {
    const entry = entryOf(campusDraft);
    const archived = new Set(reportArtifacts(report(campusDraft)).map((file) => file.name));
    const files = entryFiles(entry);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => archived.has(file))).toBe(true);
    expect(files).toEqual([...new Set(files)]);

    // The hidden exits' pictures stay in the archive only.
    const hiddenExits = campusRecording.items
      .filter((item) => item.kind === 'capture' && item.capture.label === '99-before-navigation' && item.capture.viewId !== 4)
      .map(itemFile);
    expect(hiddenExits.length).toBeGreaterThan(0);
    expect(files.some((file) => hiddenExits.includes(file))).toBe(false);

    const scroll = entry.steps.find((step) => step.event.key === 'scroll:3:01')!.event;
    expect(scroll.kind === 'scroll' && scroll.clip).toMatchObject({ file: expect.stringMatching(/\.webm$/), trace: expect.any(Array) });
  });

  it('keeps steps before the first phase outside any phase', () => {
    const { steps, phases } = entryOf(ungroupedLeadDraft);
    expect(steps.slice(0, 2).map((step) => [step.event.key, step.phase])).toEqual([['page:1', null], ['scroll:1:01', null]]);
    expect(phases.map((phase) => phase.number)).toEqual([1, 2]);
  });

  it('keeps a written phase whose steps are all hidden, without their notes', () => {
    const entry = entryOf(phaseAllHiddenDraft);
    expect(entry.phases.at(-1)?.title).toBe('I try to orient myself with Maps');
    expect(entry.steps.some((step) => step.phase === 3)).toBe(false);
    expect(JSON.stringify(entry)).not.toContain('A note on a hidden step.');
  });

  it('is called after the page it started on until a title is written', () => {
    expect(entryOf(emptyDraft)).toMatchObject({ title: campusRecording.meta.tab.title, intro: [], conclusion: [], phases: [] });
    expect(entryOf({ ...campusDraft, fields: { ...campusDraft.fields, title: '   ' } }).title).toBe(campusRecording.meta.tab.title);
    expect(entryOf(emptyDraft).steps.every((step) => step.phase === null)).toBe(true);
  });

  it('survives JSON unchanged, as a store keeps it', () => {
    const entry = entryOf(campusDraft);
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  });
});

describe('event media', () => {
  it('turns each picture and video into another form without touching the rest', () => {
    const events = recordingEvents(campusRecording, inlineMedia);
    const sized = events.map((event) => mapEventMedia(event, (frame) => frame.base64.length, (clip) => clip.label));
    expect(sized.map(({ key, kind, atMs }) => ({ key, kind, atMs }))).toEqual(events.map(({ key, kind, atMs }) => ({ key, kind, atMs })));
    const scroll = sized.find((event) => event.key === 'scroll:3:01');
    expect(scroll).toMatchObject({ before: expect.any(Number), after: expect.any(Number), clip: '04-post-scroll-01' });
    const page = sized.find((event) => event.kind === 'page');
    expect(page).toMatchObject({ frame: expect.any(Number) });
  });
});
