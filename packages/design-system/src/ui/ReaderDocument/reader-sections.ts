import type { EntryField, EntryPhase, EntryStep, JourneyEntry } from '@openuji/journey';

/** A part of the report as it is read, and as the contents list it. */
export type ReaderSection = Readonly<{ id: string; title: string }> & (
  | Readonly<{ kind: 'intro'; fields: readonly EntryField[]; steps: readonly EntryStep[] }>
  | Readonly<{ kind: 'phase'; phase: EntryPhase; steps: readonly EntryStep[] }>
  | Readonly<{ kind: 'conclusion'; fields: readonly EntryField[] }>
);

export function phaseHeading(entry: JourneyEntry, phase: EntryPhase): string {
  const name = `${entry.phaseWording.name} ${phase.number}`;
  return phase.title ? `${name} — ${phase.title}` : name;
}

/**
 * The report in reading order: an introduction when anything comes before
 * the first phase, every phase, and a conclusion when one was written.
 */
export function readerSections(entry: JourneyEntry): ReaderSection[] {
  const lead = entry.steps.filter((step) => step.phase === null);
  return [
    ...(entry.intro.length > 0 || lead.length > 0
      ? [{ kind: 'intro', id: 'introduction', title: 'Introduction', fields: entry.intro, steps: lead } as const]
      : []),
    ...entry.phases.map((phase) => ({
      kind: 'phase',
      id: `phase-${phase.number}`,
      title: phaseHeading(entry, phase),
      phase,
      steps: entry.steps.filter((step) => step.phase === phase.number),
    } as const)),
    ...(entry.conclusion.length > 0
      ? [{ kind: 'conclusion', id: 'conclusion', title: 'Conclusion', fields: entry.conclusion } as const]
      : []),
  ];
}
