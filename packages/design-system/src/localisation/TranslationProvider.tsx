import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { defaultDictionaries, extendDictionaries, translate, type Dictionaries, type Translator } from './translate';

const TranslationContext = createContext<Readonly<{ language: string; dir: 'ltr' | 'rtl'; dictionaries: Dictionaries }>>(
  Object.freeze({ language: 'en', dir: 'ltr', dictionaries: defaultDictionaries }),
);

export function TranslationProvider({
  language,
  dir = 'ltr',
  dictionaries,
  children,
}: Readonly<{
  language: string;
  dir?: 'ltr' | 'rtl';
  dictionaries?: Dictionaries;
  children: ReactNode;
}>) {
  const parent = useContext(TranslationContext);
  const messages = useMemo(() => dictionaries === undefined
    ? parent.dictionaries
    : extendDictionaries(parent.dictionaries, dictionaries), [parent.dictionaries, dictionaries]);
  const locale = useMemo(() => Object.freeze({ language, dir, dictionaries: messages }), [language, dir, messages]);
  return <TranslationContext.Provider value={locale}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const locale = useContext(TranslationContext);
  const t: Translator = useCallback(
    (key, parameters) => translate(key, locale.language, parameters, locale.dictionaries),
    [locale.language, locale.dictionaries],
  );
  return Object.freeze({ t, language: locale.language, dir: locale.dir });
}
