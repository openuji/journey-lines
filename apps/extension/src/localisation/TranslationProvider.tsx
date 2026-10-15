import type { ComponentProps } from 'react';
import { TranslationProvider } from '@openuji/design-system';
import { dictionaries } from './dictionaries';

/** The extension selects its catalogs once; views consume the shared context. */
export function ExtensionTranslationProvider(props: Omit<ComponentProps<typeof TranslationProvider>, 'dictionaries'>) {
  return <TranslationProvider {...props} dictionaries={dictionaries} />;
}
