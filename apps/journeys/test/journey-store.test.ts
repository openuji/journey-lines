import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  entryFiles,
  journeyEntry,
  reportArtifacts,
  zipStored,
  type ReportExport,
} from '@openuji/journey';
import { campusReport, mostlyUnnotedReport } from '@openuji/journey/fixtures';
import { addJourney, journeyHref, journeyMedia, readEntries, type StoreRoots } from '../src/lib/journey-store';

const archive = (report: ReportExport) => zipStored(reportArtifacts(report));
const contents = (dir: string) => readdirSync(dir).sort();

describe('journey store', () => {
  let root: string;
  let roots: StoreRoots;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'journeys-'));
    roots = { published: join(root, 'public'), archives: join(root, 'archive') };
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('publishes the entry and only the files it shows, and keeps the archive apart', () => {
    const zip = archive(campusReport);
    const { entry, updated } = addJourney(roots, zip);
    expect(updated).toBe(false);
    expect(entry).toEqual(journeyEntry(campusReport));

    expect(contents(join(roots.published, 'ses_campus'))).toEqual(['entry.json', ...entryFiles(entry)].sort());
    const archived = reportArtifacts(campusReport).map((file) => file.name);
    expect(entryFiles(entry).length).toBeLessThan(archived.length - 2);
    expect(contents(join(roots.published, 'ses_campus'))).not.toContain('report.json');

    expect(contents(roots.archives)).toEqual(['ses_campus.zip']);
    expect(new Uint8Array(readFileSync(join(roots.archives, 'ses_campus.zip')))).toEqual(zip);
    expect(readEntries(roots.published)).toEqual([entry]);
  });

  it('replaces a published journey filed again, dropping media of steps hidden since', () => {
    addJourney(roots, archive(campusReport));
    const shownBefore = contents(join(roots.published, 'ses_campus'));
    const hideAll: ReportExport = {
      ...campusReport,
      draft: {
        ...campusReport.draft,
        fields: { ...campusReport.draft.fields, title: 'Edited title' },
        steps: Object.fromEntries(journeyEntry(campusReport).steps.slice(1).map((step) => [step.event.key, { hidden: true }])),
      },
    };
    const { updated, entry } = addJourney(roots, archive(hideAll));
    expect(updated).toBe(true);
    expect(contents(join(roots.published, 'ses_campus'))).toEqual(['entry.json', ...entryFiles(entry)].sort());
    expect(contents(join(roots.published, 'ses_campus')).length).toBeLessThan(shownBefore.length);
    expect(readEntries(roots.published).map((item) => item.title)).toEqual(['Edited title']);
  });

  it('lists the newest journey first', () => {
    addJourney(roots, archive(mostlyUnnotedReport));
    addJourney(roots, archive(campusReport));
    expect(readEntries(roots.published).map((entry) => entry.id)).toEqual(['ses_campus', 'ses_mostly_unnoted']);
  });

  it('writes nothing for a broken archive or an id that would leave its folder', () => {
    expect(() => addJourney(roots, new TextEncoder().encode('not a zip'))).toThrow('Not a ZIP archive');
    const escaping = { ...campusReport, recording: { ...campusReport.recording, meta: { ...campusReport.recording.meta, id: '../escape' } } };
    expect(() => addJourney(roots, archive(escaping))).toThrow('can\'t name a folder');
    expect(readdirSync(root)).toEqual([]);
  });

  it('has no journeys before the first one is added, and names an outdated entry', () => {
    expect(readEntries(roots.published)).toEqual([]);
    addJourney(roots, archive(campusReport));
    writeFileSync(join(roots.published, 'ses_campus', 'entry.json'), JSON.stringify({ version: 1 }));
    expect(() => readEntries(roots.published)).toThrow('Add its archive again');
  });

  it('addresses a journey and its media under the site base', () => {
    expect(journeyHref('/', 'ses_campus')).toBe('/journeys/ses_campus/');
    expect(journeyHref('/research', 'ses_campus')).toBe('/research/journeys/ses_campus/');
    const entry = journeyEntry(campusReport);
    const media = journeyMedia('/', entry);
    expect(Object.keys(media)).toEqual(entryFiles(entry));
    expect(Object.values(media).every((url) => url.startsWith('/journeys/ses_campus/'))).toBe(true);
  });
});
