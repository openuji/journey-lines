/**
 * A report's wording, as data. Components render these labels and
 * placeholders and add none of their own; a draft's `fields` are keyed by the
 * ids here, so changing a template changes which fields a report has.
 */

import type { PhaseField } from './report-draft';

export type FieldText = Readonly<{ label: string; placeholder: string }>;

export type TemplateField = FieldText & Readonly<{
  id: string;
  /** How the field reads: a line above the title, the title, a labelled paragraph, or a headed section. */
  kind: 'subject' | 'title' | 'statement' | 'section';
}>;

export type ReportTemplate = Readonly<{
  /** Above the steps. */
  header: readonly TemplateField[];
  phase: Readonly<{ name: string } & Record<PhaseField, FieldText>>;
  note: FieldText;
  /** Below the steps. */
  closing: readonly TemplateField[];
}>;

/** One journey, told by the person who made it, for people who weren't there. */
export const journeyTemplate: ReportTemplate = {
  header: [
    {
      id: 'subject',
      kind: 'subject',
      label: 'Subject',
      placeholder: 'Journey 01 · Campus orientation · Freie Universität Berlin',
    },
    {
      id: 'title',
      kind: 'title',
      label: 'Title',
      placeholder: 'Where is my lecture hall, actually?',
    },
    {
      id: 'goal',
      kind: 'statement',
      label: 'My goal',
      placeholder: 'I want to find out how to get to lecture hall 1b, where my lecture takes place.',
    },
    {
      id: 'result',
      kind: 'statement',
      label: 'Result',
      placeholder: 'In the end I know where the building complex is, but not the way to the lecture hall.',
    },
  ],
  phase: {
    name: 'Phase',
    title: { label: 'Phase title', placeholder: 'I find an address' },
    happened: {
      label: 'What happens?',
      placeholder: 'On the course page I find the location “Hs 1b Hörsaal, Habelschwerdter Allee 45”.',
    },
    problem: {
      label: 'The problem',
      placeholder: 'The address names a place, but doesn’t explain how to find the room inside the building complex.',
    },
  },
  note: { label: 'Note', placeholder: 'What this step shows, in your words' },
  closing: [
    {
      id: 'insight',
      kind: 'section',
      label: 'Key insight',
      placeholder: 'A correct address is not yet enough to find your way.',
    },
    {
      id: 'idea',
      kind: 'section',
      label: 'Improvement idea',
      placeholder: 'Link the location and the lecture hall page to a marked floor plan, with the right entrance and the way from it.',
    },
    {
      id: 'scope',
      kind: 'section',
      label: 'Scope',
      placeholder: 'One exemplary attempt. It doesn’t show how often other students meet the same difficulty.',
    },
  ],
};
