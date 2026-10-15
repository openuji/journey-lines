import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getJourneyTemplate, journeyEntry, readReportArtifacts, reportArtifacts, type EntryStep, type JourneyEntry, type ReportExport } from '@journey-lines/journey';
import { campusEntry, campusReport, longTextReport, mostlyUnnotedReport, untitledReport } from '@journey-lines/journey/fixtures';
import { storyMedia } from '../src/stories/media';
import { readerSections } from '../src/ui/ReaderDocument/reader-sections';
import { ReportReader } from '../src/ui/ReportReader/ReportReader';

const render = (report: ReportExport, media = storyMedia(report)) =>
  renderToStaticMarkup(createElement(ReportReader, { entry: journeyEntry(report), media, back: { href: '/', label: 'Journeys' } }));

const withoutConclusion: ReportExport = {
  ...campusReport,
  draft: { ...campusReport.draft, fields: { ...campusReport.draft.fields, insight: '', idea: '', scope: '' } },
};

const step = (key: string, atMs: number, url: string, phase: number | null): EntryStep => ({
  event: { kind: 'page', entry: 'load', key, viewId: 1, url, atMs },
  note: '',
  phase,
});

/** Lead, a phase across sites, a phase whose steps were all hidden, and a last phase. */
const spanned: JourneyEntry = {
  ...campusEntry,
  startedAtMs: 1_000,
  endedAtMs: 61_000,
  phases: [1, 2, 3].map((number) => ({ number, title: `P${number}`, happened: '', problem: '' })),
  steps: [
    step('page:1', 0, 'https://www.fu-berlin.de/vv', null),
    step('page:2', 5_000, 'https://www.google.com/search?q=x', 1),
    step('page:3', 8_000, 'about:blank', 1),
    step('page:4', 9_000, 'https://www.fu-berlin.de/a', 1),
    step('page:5', 9_500, 'https://www.google.com/maps', 1),
    step('page:6', 20_000, 'https://www.google.com/maps/place', 3),
  ],
};

describe('reader sections', () => {
  it('reads as an overview, then each phase', () => {
    expect(readerSections(journeyEntry(campusReport)).map((section) => [section.id, section.title])).toEqual([
      ['overview', 'Overview'],
      ['phase-1', 'Phase 1 — I find an address'],
      ['phase-2', 'Phase 2 — I search for the lecture hall'],
      ['phase-3', 'Phase 3 — I try to orient myself with Maps'],
    ]);
  });

  it('puts the closing statements in the overview, after the opening ones', () => {
    const [overview] = readerSections(journeyEntry(campusReport));
    expect(overview?.kind === 'overview' && overview.fields.map((field) => field.id))
      .toEqual(['title', 'goal', 'result', 'insight', 'idea', 'scope']);
  });

  it('files each step under the section it is read in', () => {
    const sections = readerSections(journeyEntry(mostlyUnnotedReport));
    expect(sections.flatMap((section) => section.steps)).toEqual(journeyEntry(mostlyUnnotedReport).steps);
  });

  it('times each phase to the next shown step, the last to the end of the recording, and names its sites in order', () => {
    const spans = readerSections(spanned).flatMap((section) => section.kind === 'phase' ? [[section.id, section.span]] : []);
    expect(spans).toEqual([
      ['phase-1', { durationMs: 15_000, sites: ['google.com', 'fu-berlin.de', 'google.com'] }],
      ['phase-2', undefined],
      ['phase-3', { durationMs: 40_000, sites: ['google.com'] }],
    ]);
  });

  it('leaves out an overview with nothing to show', () => {
    const bare: JourneyEntry = { ...spanned, tags: [], intro: [], conclusion: [], steps: spanned.steps.filter((s) => s.phase !== null) };
    expect(readerSections({ ...bare, phases: bare.phases.slice(0, 1) }).map((section) => section.id)).toEqual(['phase-1']);
    expect(readerSections(bare)[0]?.id).toBe('overview');
  });
});

describe('ReportReader', () => {
  it.each(['en', 'de'] as const)('reads a %s export in the host language and leaves tags, custom labels, and authored text unchanged', (sourceLanguage) => {
    const language = sourceLanguage === 'de' ? 'en' : 'de';
    const template = getJourneyTemplate(sourceLanguage);
    const tags = ['report.preview', 'event.click', 'Freie Universität Berlin', 'Research'];
    const exported = readReportArtifacts(reportArtifacts({
      ...campusReport,
      template: { ...template, header: template.header.map((field) => field.id === 'result' ? { ...field, label: 'Custom result' } : field) },
      draft: { ...campusReport.draft, tags },
    }));
    const entry = journeyEntry(exported);
    const original = JSON.stringify(entry);
    const html = renderToStaticMarkup(createElement(ReportReader, {
      entry, media: storyMedia(exported), locale: { language, dir: 'ltr' },
    }));
    const goal = getJourneyTemplate(language).header.find((field) => field.id === 'goal')!;
    expect(html).toContain(goal.label);
    expect(html).not.toContain(template.header.find((field) => field.id === 'goal')!.label);
    expect(html).toContain('Custom result');
    expect(html).toContain('Where is my lecture hall, actually?');
    expect(html).toContain(campusReport.draft.fields.goal);
    expect(html).toContain(language === 'de' ? 'aria-label="Schlagwörter"' : 'aria-label="Tags"');
    for (const tag of tags) expect(html).toContain('>' + tag + '</li>');
    expect(JSON.stringify(entry)).toBe(original);
    expect(exported.draft.tags).toEqual(tags);
  });

  it('shows the written report beside its contents, with nothing to edit', () => {
    const html = render(campusReport);
    expect(html).toContain('aria-label="Contents"');
    expect(html).toContain('href="#phase-3"');
    expect(html).not.toContain('id="conclusion"');
    expect(html).toContain('Where is my lecture hall, actually?');
    expect(html).toContain('href="/"');
    expect(html.match(/data-event-title/g)).toHaveLength(journeyEntry(campusReport).steps.length);
    for (const step of journeyEntry(campusReport).steps) expect(html).toContain(`data-step-key="${step.event.key}"`);
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('Hidden ·');
    expect(html).not.toContain('Download .zip');
  });

  it('says what was learned before the first phase', () => {
    const html = render(campusReport);
    const insight = html.indexOf(campusReport.draft.fields.insight!.split('\n')[0]!);
    expect(insight).toBeGreaterThan(-1);
    expect(insight).toBeLessThan(html.indexOf('id="phase-1"'));
  });

  it('maps the phases: each opens its phase and says how long, where, and what went wrong', () => {
    const html = render(campusReport);
    const map = html.slice(html.indexOf('How it went'), html.indexOf('id="phase-1"'));
    for (const phase of campusEntry.phases) {
      expect(map).toContain(`href="#phase-${phase.number}"`);
      expect(map).toContain(phase.problem);
    }
    expect(map).toContain('google.com → fu-berlin.de');
  });

  it('gives each phase the same numbered badge in the map and at its head', () => {
    const html = render(campusReport);
    for (const phase of campusEntry.phases) {
      expect(html.match(new RegExp(`Phase </span>${phase.number}</span>`, 'g'))).toHaveLength(2);
    }
    const head = html.slice(html.indexOf('id="phase-2"'), html.indexOf('id="phase-3"'));
    expect(head).toContain('google.com → fu-berlin.de');
  });

  it('leaves out the map for a single phase', () => {
    expect(render(longTextReport)).not.toContain('How it went');
  });

  it('puts a step’s note before its pictures', () => {
    const html = render(campusReport);
    const note = html.indexOf('The address is the only hint at where the course takes place.');
    const step = html.lastIndexOf('<li', note);
    const picture = html.indexOf('<img', step);
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(picture);
  });

  it('has no switches: its pictures open the step viewer, and a clip plays in its step', () => {
    const html = render(campusReport);
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Show time');
    const viewer = /<dialog[^>]* id="([^"]+)"/.exec(html)?.[1];
    expect(viewer).toMatch(/^step-viewer-/);
    const pictures = [...html.matchAll(/<button[^>]*data-action-label="Expand"[^>]*>/g)].map(([tag]) => tag);
    expect(pictures.length).toBeGreaterThan(0);
    for (const tag of pictures) expect(tag).toContain(`aria-controls="${viewer}"`);
    const play = [...html.matchAll(/<button[^>]*aria-label="Play video"[^>]*>/g)].map(([tag]) => tag);
    expect(play.length).toBeGreaterThan(0);
    for (const tag of play) expect(tag).toMatch(/aria-controls="clip-playback-/);
  });

  it('leaves out closing statements nobody wrote, and contents for a single section', () => {
    expect(render(withoutConclusion)).not.toContain(campusReport.draft.fields.idea!);
    expect(render(untitledReport)).not.toContain('aria-label="Contents"');
  });

  it('marks pictures it cannot load as unavailable', () => {
    expect(render(campusReport, {})).toContain('frame unavailable');
  });

  it('localizes standard entry labels and media controls for German readers', () => {
    const html = renderToStaticMarkup(createElement(ReportReader, {
      entry: journeyEntry(campusReport), media: storyMedia(campusReport), locale: { language: 'de', dir: 'ltr' },
      repositoryHref: 'https://github.com/openuji/journey-lines',
    }));
    expect(html).toContain('lang="de" dir="ltr"');
    expect(html).toContain('aria-label="Inhalt"');
    expect(html).toContain('Mein Ziel');
    expect(html).toContain('Was passiert?');
    expect(html).toContain('data-action-label="Öffnen"');
    expect(html).toContain('aria-label="Bild „Vorher“ öffnen"');
    expect(html).toContain('aria-label="Projekt auf GitHub öffnen"');
    expect(html).toContain('Where is my lecture hall, actually?');
  });

  it('keeps English copy with explicit RTL direction', () => {
    const html = renderToStaticMarkup(createElement(ReportReader, {
      entry: journeyEntry(campusReport), media: storyMedia(campusReport), locale: { language: 'en', dir: 'rtl' },
    }));
    expect(html).toContain('lang="en" dir="rtl"');
    expect(html).toContain('aria-label="Contents"');
    expect(html).toContain('data-action-label="Expand"');
  });
});
