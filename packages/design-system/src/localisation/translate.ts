import en from './en.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };

export type Dictionaries = Readonly<
  Record<string, Readonly<Record<string, string | Readonly<{ one: string; other: string }>>>>
>;
export type TranslationParameters = Readonly<Record<string, string | number>>;
export type Translator = (key: string, parameters?: TranslationParameters) => string;

const immutableDictionary = (messages: Dictionaries[string]): Dictionaries[string] =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(messages).map(([key, message]) => [
        key,
        typeof message === 'string' ? message : Object.freeze({ ...message }),
      ]),
    ),
  );

export const defaultDictionaries: Dictionaries = Object.freeze({
  en: immutableDictionary(en),
  de: immutableDictionary(de),
});

/** Host messages extend the same-language shared messages within a provider scope. */
export function extendDictionaries(base: Dictionaries, overrides: Dictionaries): Dictionaries {
  return Object.freeze({
    ...base,
    ...Object.fromEntries(Object.entries(overrides).map(([language, messages]) => [
      language, immutableDictionary({ ...base[language], ...messages }),
    ])),
  });
}

/** Lookup and formatting only: no React, locale state, or component dependencies. */
export function translate(
  key: string,
  language = 'en',
  parameters: TranslationParameters = {},
  messages: Dictionaries = defaultDictionaries,
): string {
  const dictionary = Object.hasOwn(messages, language) ? messages[language] : undefined;
  const message = dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
  if (message === undefined) return key;
  const pattern =
    typeof message === 'string'
      ? message
      : typeof parameters.count === 'number' && new Intl.PluralRules(language).select(parameters.count) === 'one'
        ? message.one
        : message.other;
  return pattern.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder,
  );
}

/** Pure helpers default to the same English dictionary as standalone components. */
export const translateEnglish: Translator = (key, parameters) => translate(key, 'en', parameters);
