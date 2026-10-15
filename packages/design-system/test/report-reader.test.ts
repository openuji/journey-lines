import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getJourneyTemplate, journeyEntry, readReportArtifacts, reportArtifacts, type ReportExport } from '@openuji/journey';
import { campusReport, mostlyUnnotedReport, untitledReport } from '@openuji/journey/fixtures';
import { storyMedia } from '../src/stories/media';
import { readerSections } from '../src/ui/ReaderDocument/reader-sections';
import { ReportReader } from '../src/ui/ReportReader/ReportReader';

const render = (report: ReportExport, media = storyMedia(report)) =>
  renderToStaticMarkup(createElement(ReportReader, { entry: journeyEntry(report), media, back: { href: '/', label: 'Journeys' } }));

const withoutConclusion: ReportExport = {
  ...campusReport,
  draft: { ...campusReport.draft, fields: { ...campusReport.draft.fields, insight: '', idea: '', scope: '' } },
};

describe('reader sections', () => {
  it('reads as introduction, each phase, and a conclusion when one was written', () => {
    expect(readerSections(journeyEntry(campusReport)).map((section) => [section.id, section.title])).toEqual([
      ['introduction', 'Introduction'],
      ['phase-1', 'Phase 1 — I find an address'],
      ['phase-2', 'Phase 2 — I search for the lecture hall'],
      ['phase-3', 'Phase 3 — I try to orient myself with Maps'],
      ['conclusion', 'Conclusion'],
    ]);
    expect(readerSections(journeyEntry(withoutConclusion)).at(-1)?.id).toBe('phase-3');
  });

  it('files each step under the section it is read in', () => {
    const sections = readerSections(journeyEntry(mostlyUnnotedReport));
    const steps = sections.flatMap((section) => section.kind === 'conclusion' ? [] : section.steps);
    expect(steps).toEqual(journeyEntry(mostlyUnnotedReport).steps);
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
    expect(html).toContain('id="conclusion"');
    expect(html).toContain('Where is my lecture hall, actually?');
    expect(html).toContain('href="/"');
    expect(html.match(/data-event-title/g)).toHaveLength(journeyEntry(campusReport).steps.length);
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('Hidden ·');
    expect(html).not.toContain('Download .zip');
  });

  it('puts a step’s note before its pictures', () => {
    const html = render(campusReport);
    const note = html.indexOf('The address is the only hint at where the course takes place.');
    const step = html.lastIndexOf('<li', note);
    const picture = html.indexOf('<img', step);
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(picture);
  });

  it('offers one time-and-address toggle per step, and one for all', () => {
    const html = render(mostlyUnnotedReport);
    const steps = journeyEntry(mostlyUnnotedReport).steps.length;
    expect(html.match(/type="checkbox"/g)).toHaveLength(steps + 1);
    expect(html).toContain('Show time &amp; address');
  });

  it('leaves out a conclusion nobody wrote, and contents for a single section', () => {
    expect(render(withoutConclusion)).not.toContain('Conclusion');
    expect(render(untitledReport)).not.toContain('aria-label="Contents"');
  });

  it('marks pictures it cannot load as unavailable', () => {
    expect(render(campusReport, {})).toContain('frame unavailable');
  });

  it('localizes standard entry labels and media controls for German readers', () => {
    const html = renderToStaticMarkup(createElement(ReportReader, {
      entry: journeyEntry(campusReport), media: storyMedia(campusReport), locale: { language: 'de', dir: 'ltr' },
    }));
    expect(html).toContain('lang="de" dir="ltr"');
    expect(html).toContain('aria-label="Inhalt"');
    expect(html).toContain('Mein Ziel');
    expect(html).toContain('Was passiert?');
    expect(html).toContain('Zeit und Adresse anzeigen');
    expect(html).toContain('data-action-label="Öffnen"');
    expect(html).toContain('aria-label="Bild „Vorher“ öffnen"');
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
