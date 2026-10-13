/** Finished reports, as an archive carries them, and the journey entries derived from them. */

import { journeyEntry, type JourneyEntry } from '../journey-entry.js';
import type { StoredRecording } from '../recording.js';
import { REPORT_VERSION, type ReportExport } from '../report-archive.js';
import { emptyDraft, type ReportDraft } from '../report-draft.js';
import { journeyTemplate } from '../report-template.js';
import { campusDraft, campusRecording, longTextDraft } from './campus-journey.js';
import { storyLongReport, storyReportWithClip } from './report-sessions.js';

const DAY_MS = 86_400_000;

const report = (recording: StoredRecording, draft: ReportDraft): ReportExport =>
  ({ version: REPORT_VERSION, template: journeyTemplate, draft, recording });

/** The same recording made `days` earlier, under another id: every time moves with it. */
const earlier = (recording: StoredRecording, id: string, days: number): StoredRecording => {
  const by = -days * DAY_MS;
  return {
    meta: { ...recording.meta, id, startedAtMs: recording.meta.startedAtMs + by, endedAtMs: recording.meta.endedAtMs + by },
    items: recording.items.map((item) => item.kind === 'capture'
      ? {
        ...item,
        epochMs: item.epochMs + by,
        capture: { ...item.capture, frame: { ...item.capture.frame, receivedAtMs: item.capture.frame.receivedAtMs + by } },
      }
      : { ...item, epochMs: item.epochMs + by }),
  };
};

/** Written up as in changes/overfitted-report.md. */
export const campusReport = report(campusRecording, campusDraft);
/** Downloaded before anything was written. */
export const untitledReport = report(earlier(storyReportWithClip, 'ses_untitled', 2), emptyDraft);
export const longTextReport = report(earlier(campusRecording, 'ses_long_text', 9), longTextDraft);

/**
 * Shaped like a real first report: many steps and few notes, six phases,
 * some starting mid-page, some steps hidden, a single closing field.
 * Keys, per view n of 4: page:n click:n:01 scroll:n:02 click:n:03 scroll:n:04 click:n:05
 */
export const mostlyUnnotedDraft: ReportDraft = {
  fields: {
    subject: 'Journey 02 · Course registration · Freie Universität Berlin',
    title: 'How do I sign up for the seminar?',
    goal: 'I want to register for the seminar I found in the course catalogue.',
    result: 'I find the registration page, but not whether my registration went through.',
    idea: 'Confirm a registration on the page itself, and list it under “My courses” straight away.',
  },
  phases: {
    'page:1': { title: 'I open the catalogue', happened: 'I start on the course catalogue and look for the seminar.' },
    'page:2': { title: 'I find the seminar' },
    'scroll:2:04': { title: 'I look for a sign-up', problem: 'There is no registration button near the course details.' },
    'page:3': { title: 'I try the campus portal' },
    'page:4': { title: 'I register' },
    'click:4:05': { title: 'I check my courses', problem: 'The seminar does not show up, and nothing tells me why.' },
  },
  steps: {
    'scroll:1:02': { hidden: true },
    'click:2:03': { hidden: true },
    'scroll:3:04': { hidden: true },
    'click:4:03': { hidden: true },
    'click:1:03': { note: 'The catalogue lists the seminar twice, once per semester.' },
    'click:2:05': { note: 'The course details open in the same tab.\nThe back button loses my filters.' },
    'click:4:01': { note: 'The register button is below the fold.' },
  },
};
export const mostlyUnnotedReport = report(earlier(storyLongReport, 'ses_mostly_unnoted', 1), mostlyUnnotedDraft);

export const campusEntry: JourneyEntry = journeyEntry(campusReport);
export const mostlyUnnotedEntry: JourneyEntry = journeyEntry(mostlyUnnotedReport);
export const untitledEntry: JourneyEntry = journeyEntry(untitledReport);
export const longTextEntry: JourneyEntry = journeyEntry(longTextReport);
/** Newest first, as a store lists them. */
export const storyEntries: readonly JourneyEntry[] = [campusEntry, mostlyUnnotedEntry, untitledEntry, longTextEntry];
