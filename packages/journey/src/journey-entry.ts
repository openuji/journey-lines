/**
 * A journey as one flat record: what a reader of its report sees, in plain
 * text, without media. It is derived from the report alone, so a store can
 * rebuild every entry when this shape changes; listing and search read it
 * instead of the archive.
 */

import { recordingEvents, type JourneyEvent } from './journey-events.js';
import { recordingTitle } from './recording.js';
import type { ReportExport } from './report-archive.js';
import { reportOutline, type OutlineStep } from './report-draft.js';
import type { TemplateField } from './report-template.js';

export const JOURNEY_ENTRY_VERSION = 1;

export type EntryField = Readonly<{ id: string; kind: TemplateField['kind']; label: string; text: string }>;

export type EntryPhase = Readonly<{ number: number; title: string; happened: string; problem: string }>;

export type EntryStep = Readonly<{
  key: string;
  kind: JourneyEvent['kind'];
  url: string;
  /** Since the recording started. */
  atMs: number;
  note: string;
  /** The phase it belongs to; null before the first phase. */
  phase: number | null;
}>;

export type JourneyEntry = Readonly<{
  version: typeof JOURNEY_ENTRY_VERSION;
  id: string;
  /** The written title, else what the recording is called. */
  title: string;
  /** The page the recording started on. */
  page: Readonly<{ title: string; url: string }>;
  startedAtMs: number;
  endedAtMs: number;
  /** The header and closing fields that were written, in template order. */
  fields: readonly EntryField[];
  phases: readonly EntryPhase[];
  /** Every step a reader sees, in recorded order; hidden steps are left out. */
  steps: readonly EntryStep[];
}>;

const written = (text: string | undefined): string => (text ?? '').trim();

const entryStep = (phase: number | null) => ({ event, note }: OutlineStep): EntryStep => ({
  key: event.key,
  kind: event.kind,
  url: event.url,
  atMs: event.atMs,
  note: written(note),
  phase,
});

/** The entry is the report's preview outline, so it and the rendered report always agree. */
export function journeyEntry({ template, draft, recording }: ReportExport): JourneyEntry {
  const outline = reportOutline(draft, recordingEvents(recording), 'preview');
  const fields = [...template.header, ...template.closing]
    .map(({ id, kind, label }) => ({ id, kind, label, text: written(draft.fields[id]) }))
    .filter((field) => field.text !== '');

  return {
    version: JOURNEY_ENTRY_VERSION,
    id: recording.meta.id,
    title: fields.find((field) => field.kind === 'title')?.text ?? recordingTitle(recording.meta),
    page: { title: recording.meta.tab.title, url: recording.meta.tab.url },
    startedAtMs: recording.meta.startedAtMs,
    endedAtMs: recording.meta.endedAtMs,
    fields,
    phases: outline.phases.map(({ number, text }) => ({
      number,
      title: written(text.title),
      happened: written(text.happened),
      problem: written(text.problem),
    })),
    steps: [
      ...outline.lead.map(entryStep(null)),
      ...outline.phases.flatMap((phase) => phase.steps.map(entryStep(phase.number))),
    ],
  };
}
