import { useEffect, useState } from 'react';
import type { ReportLanguage } from '@openuji/journey';
import { useTranslation } from '@openuji/design-system';
import { defaultExtensionLanguage, loadExtensionLanguage } from '../../lib/settings';
import { ExtensionTranslationProvider } from '../../localisation/TranslationProvider';
import { Settings } from '../../ui/Settings/Settings';

export function Options() {
  const [savedLanguage, setLanguage] = useState<ReportLanguage | null>(null);
  const language = savedLanguage ?? defaultExtensionLanguage;

  useEffect(() => {
    let active = true;
    void loadExtensionLanguage().then((language) => { if (active) setLanguage(language); });
    return () => { active = false; };
  }, []);

  return (
    <ExtensionTranslationProvider language={language}>
      <OptionsPage ready={savedLanguage !== null} />
    </ExtensionTranslationProvider>
  );
}

function OptionsPage({ ready }: { ready: boolean }) {
  const { t, language, dir } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    document.title = t('settings.pageTitle');
  }, [language, dir, t]);

  return ready ? <Settings /> : <p role="status">{t('settings.loading')}</p>;
}
