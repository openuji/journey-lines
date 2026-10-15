/**
 * A report's wording, as data. Components render these labels and
 * placeholders and add none of their own; a draft's `fields` are keyed by the
 * ids here, so changing a template changes which fields a report has.
 */

import en from './localisation/en.json' with { type: 'json' };
import de from './localisation/de.json' with { type: 'json' };
import type { PhaseField } from './report-draft.js';

export type FieldText = Readonly<{ label: string; placeholder: string }>;

export type TemplateField = FieldText &
  Readonly<{
    id: string;
    /** How the field reads: the title, a labelled paragraph, or a headed section. */
    kind: 'title' | 'statement' | 'section';
  }>;

export type ReportTemplate = Readonly<{
  /** The draft's tags, above the header fields. */
  tags: FieldText;
  /** Above the steps. */
  header: readonly TemplateField[];
  phase: Readonly<{ name: string } & Record<PhaseField, FieldText>>;
  note: FieldText;
  /** Below the steps. */
  closing: readonly TemplateField[];
}>;

export type ReportLanguage = 'en' | 'de';

/** Field identity, order, and rendering kind are independent of language. */
const journeyStructure = {
  header: [
    { id: 'title', kind: 'title' },
    { id: 'goal', kind: 'statement' },
    { id: 'result', kind: 'statement' },
  ],
  closing: [
    { id: 'insight', kind: 'section' },
    { id: 'idea', kind: 'section' },
    { id: 'scope', kind: 'section' },
  ],
} as const;

const wording = { en, de };

function templateFrom(messages: Readonly<Record<string, string>>): ReportTemplate {
  const text = (key: string): string => messages[key] ?? key;
  const fieldText = (key: string): FieldText =>
    Object.freeze({
      label: text('template.' + key + '.label'),
      placeholder: text('template.' + key + '.placeholder'),
    });
  const fields = (structure: readonly Readonly<{ id: string; kind: TemplateField['kind'] }>[]) =>
    Object.freeze(structure.map((field) => Object.freeze({ ...field, ...fieldText(field.id) })));
  return Object.freeze({
    tags: fieldText('tags'),
    header: fields(journeyStructure.header),
    phase: Object.freeze({
      name: text('template.phase.name'),
      title: fieldText('phase.title'),
      happened: fieldText('phase.happened'),
      problem: fieldText('phase.problem'),
    }),
    note: fieldText('note'),
    closing: fields(journeyStructure.closing),
  });
}

const templates: Readonly<Record<ReportLanguage, ReportTemplate>> = Object.freeze({
  en: templateFrom(wording.en),
  de: templateFrom(wording.de),
});

export const journeyTemplate: ReportTemplate = templates.en;

/** Shared templates, including nested values, are immutable at runtime. */
export function getJourneyTemplate(language: ReportLanguage = 'en'): ReportTemplate {
  return templates[language];
}
