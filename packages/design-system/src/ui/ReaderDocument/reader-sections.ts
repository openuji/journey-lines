import { translateEnglish, type Translator } from '../../localisation/translate';
import { formatClock, siteOf, type EntryField, type EntryPhase, type EntryStep, type JourneyEntry } from '@openuji/journey';

/** How long a phase took and the sites it went through, as far as its shown steps tell. */
export type PhaseSpan = Readonly<{ durationMs: number; sites: readonly string[] }>;

/** A part of the report as it is read, and as the contents list it. */
export type ReaderSection = Readonly<{ id: string; title: string }> & (
  | Readonly<{ kind: 'overview'; fields: readonly EntryField[]; steps: readonly EntryStep[] }>
  | Readonly<{ kind: 'phase'; phase: EntryPhase; span?: PhaseSpan; steps: readonly EntryStep[] }>
);

export type PhaseSection = Extract<ReaderSection, { kind: 'phase' }>;

/** "Phase 2", as the template names phases. */
export const phaseName = (entry: JourneyEntry, phase: EntryPhase): string => `${entry.phaseWording.name} ${phase.number}`;

/** What a phase is called where its number stands beside it: its written title, else its name. */
export const phaseTitle = (entry: JourneyEntry, phase: EntryPhase): string => phase.title || phaseName(entry, phase);

/** How long a phase took, the sites it went through in order, and how many steps it shows. */
export function phaseFacts(
  { span, steps }: PhaseSection,
  t: Translator = translateEnglish,
  dir: 'ltr' | 'rtl' = 'ltr',
): string[] {
  return [
    ...(span ? [formatClock(span.durationMs)] : []),
    ...(span && span.sites.length > 0 ? [span.sites.join(dir === 'rtl' ? ' ← ' : ' → ')] : []),
    ...(steps.length > 0 ? [t('report.steps', { count: steps.length })] : []),
  ];
}

/** A phase in the contents: its name and its written title. */
export function phaseHeading(entry: JourneyEntry, phase: EntryPhase): string {
  const name = phaseName(entry, phase);
  return phase.title ? `${name} — ${phase.title}` : name;
}

/**
 * The report in reading order: an overview first (what was wanted, what came
 * of it, what was learned, and how it went), then every phase. The overview
 * is left out only when it would hold nothing at all.
 */
export function readerSections(entry: JourneyEntry, t: Translator = translateEnglish): ReaderSection[] {
  const lead = entry.steps.filter((step) => step.phase === null);
  const fields = [...entry.intro, ...entry.conclusion];
  return [
    ...(entry.tags.length > 0 || fields.length > 0 || lead.length > 0 || entry.phases.length > 1
      ? [{ kind: 'overview', id: 'overview', title: t('reader.overview'), fields, steps: lead } as const]
      : []),
    ...entry.phases.map((phase) => {
      const steps = entry.steps.filter((step) => step.phase === phase.number);
      const span = phaseSpan(entry, steps);
      return {
        kind: 'phase',
        id: `phase-${phase.number}`,
        title: phaseHeading(entry, phase),
        phase,
        ...(span ? { span } : {}),
        steps,
      } as const;
    }),
  ];
}

/** From the phase's first shown step to the next shown step after it, or to the end of the recording. */
function phaseSpan(entry: JourneyEntry, steps: readonly EntryStep[]): PhaseSpan | undefined {
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return undefined;
  const next = entry.steps[entry.steps.indexOf(last) + 1];
  const endMs = next ? next.event.atMs : entry.endedAtMs - entry.startedAtMs;
  const sites = steps.map((step) => siteOf(step.event.url)).filter((site) => site !== '');
  return {
    durationMs: Math.max(0, endMs - first.event.atMs),
    sites: sites.filter((site, index) => site !== sites[index - 1]),
  };
}
