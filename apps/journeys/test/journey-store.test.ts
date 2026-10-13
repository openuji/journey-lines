import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  journeyEntry,
  journeyTemplate,
  REPORT_VERSION,
  reportArtifacts,
  zipStored,
  type ReportExport,
  type StoredRecording,
} from '@openuji/journey';
import { campusDraft, campusRecording, storyReport } from '@openuji/journey/fixtures';
import { addJourney, journeyHref, readEntries } from '../src/lib/journey-store';

const exported = (recording: StoredRecording, draft = campusDraft): ReportExport =>
  ({ version: REPORT_VERSION, template: journeyTemplate, draft, recording });
const archive = (report: ReportExport) => zipStored(reportArtifacts(report));

describe('journey store', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'journeys-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('files the archive as downloaded beside its entry', () => {
    const zip = archive(exported(campusRecording));
    const { entry, updated } = addJourney(root, zip);
    expect(updated).toBe(false);
    expect(entry).toEqual(journeyEntry(exported(campusRecording)));
    expect(readdirSync(join(root, 'ses_campus')).sort()).toEqual(['entry.json', 'report.zip']);
    expect(new Uint8Array(readFileSync(join(root, 'ses_campus', 'report.zip')))).toEqual(zip);
    expect(readEntries(root)).toEqual([entry]);
  });

  it('replaces a recording filed again, as after more edits and a new download', () => {
    addJourney(root, archive(exported(campusRecording)));
    const edited = { ...campusDraft, fields: { ...campusDraft.fields, title: 'Edited title' } };
    const { updated } = addJourney(root, archive(exported(campusRecording, edited)));
    expect(updated).toBe(true);
    expect(readEntries(root).map((entry) => entry.title)).toEqual(['Edited title']);
  });

  it('lists the newest journey first', () => {
    addJourney(root, archive(exported(campusRecording)));
    const later = { ...storyReport, meta: { ...storyReport.meta, startedAtMs: campusRecording.meta.startedAtMs + 1 } };
    addJourney(root, archive(exported(later)));
    expect(readEntries(root).map((entry) => entry.id)).toEqual(['ses_storybook', 'ses_campus']);
  });

  it('writes nothing for a broken archive or an id that would leave its folder', () => {
    expect(() => addJourney(root, new TextEncoder().encode('not a zip'))).toThrow('Not a ZIP archive');
    const escaping = { ...campusRecording, meta: { ...campusRecording.meta, id: '../escape' } };
    expect(() => addJourney(root, archive(exported(escaping)))).toThrow('can\'t name a folder');
    expect(readdirSync(root)).toEqual([]);
  });

  it('has no journeys before the first one is added, and names an outdated entry', () => {
    expect(readEntries(join(root, 'missing'))).toEqual([]);
    addJourney(root, archive(exported(campusRecording)));
    writeFileSync(join(root, 'ses_campus', 'entry.json'), JSON.stringify({ version: 0 }));
    expect(() => readEntries(root)).toThrow('Add its report.zip again');
  });

  it('addresses a journey under the site base', () => {
    expect(journeyHref('/', 'ses_campus')).toBe('/journeys/ses_campus/');
    expect(journeyHref('/research', 'ses_campus')).toBe('/research/journeys/ses_campus/');
  });
});
