import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { journeyEntry, type ReportExport } from '@openuji/journey';
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
});
