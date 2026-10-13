/**
 * What the researcher adds to a recording to make it a report: texts, phases
 * and per-step notes. The steps themselves are the journey's events, named by
 * their `key`; this module decides how they group and what a reader sees.
 */

import type { JourneyEvent } from './journey-events.js';

export type ReportMode = 'edit' | 'preview';

export type PhaseText = Readonly<{ title?: string; happened?: string; problem?: string }>;
export type PhaseField = keyof PhaseText;

export type StepDraft = Readonly<{ hidden?: boolean; note?: string }>;

export type ReportDraft = Readonly<{
  /** By template field id. */
  fields: Readonly<Record<string, string>>;
  /** By the key of the step a phase begins with; it runs until the next phase begins. */
  phases: Readonly<Record<string, PhaseText>>;
  /** By step key. */
  steps: Readonly<Record<string, StepDraft>>;
}>;

export const emptyDraft: ReportDraft = { fields: {}, phases: {}, steps: {} };

export type ReportAction =
  | Readonly<{ type: 'setField'; field: string; value: string }>
  | Readonly<{ type: 'startPhase'; at: string }>
  | Readonly<{ type: 'removePhase'; at: string }>
  | Readonly<{ type: 'setPhase'; at: string; field: PhaseField; value: string }>
  | Readonly<{ type: 'setStepHidden'; at: string; hidden: boolean }>
  | Readonly<{ type: 'setStepNote'; at: string; note: string }>;

export function reportReducer(draft: ReportDraft, action: ReportAction): ReportDraft {
  switch (action.type) {
    case 'setField':
      return { ...draft, fields: { ...draft.fields, [action.field]: action.value } };
    case 'startPhase':
      return draft.phases[action.at] ? draft : { ...draft, phases: { ...draft.phases, [action.at]: {} } };
    case 'removePhase':
      // Its steps fall back into the phase before it.
      return { ...draft, phases: Object.fromEntries(Object.entries(draft.phases).filter(([at]) => at !== action.at)) };
    case 'setPhase': {
      const phase = draft.phases[action.at];
      if (!phase) return draft;
      return { ...draft, phases: { ...draft.phases, [action.at]: { ...phase, [action.field]: action.value } } };
    }
    case 'setStepHidden':
      return { ...draft, steps: { ...draft.steps, [action.at]: { ...draft.steps[action.at], hidden: action.hidden } } };
    case 'setStepNote':
      return { ...draft, steps: { ...draft.steps, [action.at]: { ...draft.steps[action.at], note: action.note } } };
  }
}

/** Editing shows every field; a reader sees only what was written. */
export function isShown(text: string | undefined, mode: ReportMode): boolean {
  return mode === 'edit' || (text ?? '').trim() !== '';
}

export type OutlineStep = Readonly<{ event: JourneyEvent; hidden: boolean; note: string }>;

export type OutlinePhase = Readonly<{
  /** The key of the step it begins with. */
  at: string;
  number: number;
  text: PhaseText;
  steps: readonly OutlineStep[];
}>;

export type ReportOutline = Readonly<{
  /** Steps before the first phase. */
  lead: readonly OutlineStep[];
  phases: readonly OutlinePhase[];
}>;

const phaseFields: readonly PhaseField[] = ['title', 'happened', 'problem'];

/**
 * Steps stay in recorded order; a phase is the run of steps from its first
 * step to the next phase's. A phase whose step is not in `events` is ignored.
 * A reader sees no hidden steps, and no phase with nothing left to show.
 */
export function reportOutline(
  draft: ReportDraft,
  events: readonly JourneyEvent[],
  mode: ReportMode,
): ReportOutline {
  const lead: OutlineStep[] = [];
  const phases: { at: string; text: PhaseText; steps: OutlineStep[] }[] = [];

  for (const event of events) {
    const text = draft.phases[event.key];
    if (text) phases.push({ at: event.key, text, steps: [] });
    const { hidden = false, note = '' } = draft.steps[event.key] ?? {};
    if (hidden && mode === 'preview') continue;
    (phases.at(-1)?.steps ?? lead).push({ event, hidden, note });
  }

  return {
    lead,
    phases: phases
      .filter((phase) => phase.steps.length > 0 || phaseFields.some((field) => isShown(phase.text[field], mode)))
      .map((phase, index) => ({ ...phase, number: index + 1 })),
  };
}
