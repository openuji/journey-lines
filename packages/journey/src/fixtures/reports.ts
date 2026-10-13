/** Finished reports, as an archive carries them, and the journey entries derived from them. */

import { journeyEntry, type JourneyEntry } from '../journey-entry.js';
import type { StoredRecording } from '../recording.js';
import { REPORT_VERSION, type ReportExport } from '../report-archive.js';
import { emptyDraft, type ReportDraft } from '../report-draft.js';
import { journeyTemplate } from '../report-template.js';
import { campusDraft, campusRecording, longTextDraft } from './campus-journey.js';
import { storyReportWithClip } from './report-sessions.js';

const DAY_MS = 86_400_000;

const report = (recording: StoredRecording, draft: ReportDraft): ReportExport =>
  ({ version: REPORT_VERSION, template: journeyTemplate, draft, recording });

const earlier = (recording: StoredRecording, id: string, days: number): StoredRecording => ({
  ...recording,
  meta: {
    ...recording.meta,
    id,
    startedAtMs: recording.meta.startedAtMs - days * DAY_MS,
    endedAtMs: recording.meta.endedAtMs - days * DAY_MS,
  },
});

/** Written up as in changes/overfitted-report.md. */
export const campusReport = report(campusRecording, campusDraft);
/** Downloaded before anything was written. */
export const untitledReport = report(earlier(storyReportWithClip, 'ses_untitled', 2), emptyDraft);
export const longTextReport = report(earlier(campusRecording, 'ses_long_text', 9), longTextDraft);

export const campusEntry: JourneyEntry = journeyEntry(campusReport);
export const untitledEntry: JourneyEntry = journeyEntry(untitledReport);
export const longTextEntry: JourneyEntry = journeyEntry(longTextReport);
/** Newest first, as a store lists them. */
export const storyEntries: readonly JourneyEntry[] = [campusEntry, untitledEntry, longTextEntry];
