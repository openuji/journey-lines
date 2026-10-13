/**
 * A journey as its readers see it: the written report around the steps that
 * were kept, with each step's pictures and video named by their archive file.
 * It is derived from the report alone, so a store can rebuild every entry
 * when this shape changes. Listing, reading and search all read it; the
 * archive itself is never needed to show a journey.
 */

import type { ClipTraceSample } from '@openuji/core';
import { recordingEvents, type EventMedia, type JourneyEvent } from './journey-events.js';
import { recordingTitle } from './recording.js';
import { captureFile, clipFile, type ReportExport } from './report-archive.js';
import { reportOutline, type OutlineStep } from './report-draft.js';
import type { TemplateField } from './report-template.js';

export const JOURNEY_ENTRY_VERSION = 3;

/** A clip as an entry names it: its file, and when each of its frames was recorded. */
export type FiledClip = Readonly<{ file: string; trace: readonly ClipTraceSample[] }>;

/** An event whose pictures and video are archive file names. */
export type FiledEvent = JourneyEvent<string, FiledClip>;

export type EntryField = Readonly<{ id: string; kind: TemplateField['kind']; label: string; text: string }>;

export type EntryPhase = Readonly<{ number: number; title: string; happened: string; problem: string }>;

export type EntryStep = Readonly<{
  event: FiledEvent;
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
  /** What the journey is about, as the researcher tagged it. */
  tags: readonly string[];
  /** The header fields that were written, in template order. */
  intro: readonly EntryField[];
  /** The closing fields that were written, in template order. */
  conclusion: readonly EntryField[];
  /** How the report's template words a phase. */
  phaseWording: Readonly<{ name: string; happened: string; problem: string }>;
  phases: readonly EntryPhase[];
  /** Every step a reader sees, in recorded order; hidden steps are left out. */
  steps: readonly EntryStep[];
}>;

const filedMedia: EventMedia<string, FiledClip> = {
  frame: captureFile,
  clip: (clip) => ({ file: clipFile(clip), trace: clip.trace }),
};

const written = (text: string | undefined): string => (text ?? '').trim();

const writtenFields = (fields: readonly TemplateField[], values: Readonly<Record<string, string>>): EntryField[] =>
  fields
    .map(({ id, kind, label }) => ({ id, kind, label, text: written(values[id]) }))
    .filter((field) => field.text !== '');

const entryStep = (phase: number | null) => ({ event, note }: OutlineStep<FiledEvent>): EntryStep => ({
  event,
  note: written(note),
  phase,
});

/** The entry is the report's preview outline, so it and the rendered report always agree. */
export function journeyEntry({ template, draft, recording }: ReportExport): JourneyEntry {
  const outline = reportOutline(draft, recordingEvents(recording, filedMedia), 'preview');
  const intro = writtenFields(template.header, draft.fields);

  return {
    version: JOURNEY_ENTRY_VERSION,
    id: recording.meta.id,
    title: intro.find((field) => field.kind === 'title')?.text ?? recordingTitle(recording.meta),
    page: { title: recording.meta.tab.title, url: recording.meta.tab.url },
    startedAtMs: recording.meta.startedAtMs,
    endedAtMs: recording.meta.endedAtMs,
    tags: draft.tags,
    intro,
    conclusion: writtenFields(template.closing, draft.fields),
    phaseWording: {
      name: template.phase.name,
      happened: template.phase.happened.label,
      problem: template.phase.problem.label,
    },
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

function eventFiles(event: FiledEvent): readonly string[] {
  switch (event.kind) {
    case 'page': return event.frame === undefined ? [] : [event.frame];
    case 'exit': return [event.frame];
    case 'click':
    case 'scroll': return [event.before, event.after, event.clip?.file].filter((file) => file !== undefined);
  }
}

/** The archive files the entry shows, each once: all a reader needs besides the entry. */
export function entryFiles(entry: JourneyEntry): string[] {
  return [...new Set(entry.steps.flatMap(({ event }) => eventFiles(event)))];
}
