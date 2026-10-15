import en from './localisation/en.json' with { type: 'json' };
import de from './localisation/de.json' with { type: 'json' };

const dictionaries: readonly Readonly<Record<string, string>>[] = Object.freeze([
  Object.freeze({ ...en }),
  Object.freeze({ ...de }),
]);

const knownLabel = (key: string, label: string): boolean =>
  dictionaries.some((dictionary) => Object.hasOwn(dictionary, key) && dictionary[key] === label);

export const isStandardFieldLabel = (id: string, label: string): boolean =>
  knownLabel(`template.${id}.label`, label);

export const isStandardPhaseLabel = (key: 'name' | 'happened' | 'problem', label: string): boolean =>
  knownLabel(key === 'name' ? 'template.phase.name' : `template.phase.${key}.label`, label);
