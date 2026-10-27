import { useEffect, useState } from 'react';
import { Button, useTranslation } from '@journey-lines/design-system';
import { cleanTags, defaultExtensionLanguage, loadSettings, restoreDefaultSettings, saveSettings, type ExtensionSettings } from '../../lib/settings';
import styles from './Settings.module.css';
import type { ReportLanguage } from '@journey-lines/journey';
import { WEBM_DEFAULTS } from '@journey-lines/clip-webm';
import { CLICK_DEFAULTS } from '@journey-lines/rules-interaction';

export interface SettingsStorage {
  load(): Promise<ExtensionSettings>;
  save(settings: ExtensionSettings): Promise<void>;
  restore(): Promise<ExtensionSettings>;
}

const chromeSettings: SettingsStorage = { load: loadSettings, save: saveSettings, restore: restoreDefaultSettings };

export function Settings({ storage = chromeSettings }: { storage?: SettingsStorage }) {
  const { t, language: uiLanguage } = useTranslation();
  const [profilePath, setProfilePath] = useState('');
  const [tags, setTags] = useState('');
  const [videoScale, setVideoScale] = useState(String(WEBM_DEFAULTS.scale));
  const [quietSeconds, setQuietSeconds] = useState(String(CLICK_DEFAULTS.quietAfterMs / 1000));
  const [maximumSeconds, setMaximumSeconds] = useState(String(CLICK_DEFAULTS.stillMovingMs / 1000));
  const [language, setLanguage] = useState<ReportLanguage>(uiLanguage === 'en' ? 'en' : defaultExtensionLanguage);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<{ kind: 'load' | 'save'; detail?: string } | null>(null);
  const [message, setMessage] = useState('');

  const showSettings = (settings: ExtensionSettings): void => {
    setProfilePath(settings.privacy.profilePath);
    setTags(settings.report.tags.join('\n'));
    setVideoScale(String(settings.video.scale));
    setQuietSeconds(String(settings.click.quietAfterMs / 1000));
    setMaximumSeconds(String(settings.click.stillMovingMs / 1000));
    setLanguage(settings.report.language);
  };

  useEffect(() => {
    let active = true;
    setBusy(true);
    void storage.load().then((settings) => { if (active) showSettings(settings); })
      .catch(() => { if (active) setError({ kind: 'load' }); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [storage]);

  const save = async (restore = false) => {
    setBusy(true); setError(null); setMessage('');
    try {
      if (restore) {
        showSettings(await storage.restore());
      } else await storage.save({
        privacy: { profilePath }, report: { language, tags: cleanTags(tags.split('\n')) },
        video: { scale: Number(videoScale) },
        click: { quietAfterMs: Math.round(Number(quietSeconds) * 1000), stillMovingMs: Math.round(Number(maximumSeconds) * 1000) },
      });
      setMessage(restore ? 'settings.restored' : 'settings.saved');
    } catch (error) {
      setError({ kind: 'save', detail: error instanceof Error ? error.message : undefined });
    } finally { setBusy(false); }
  };

  return (
    <main className={styles['settings']} lang={uiLanguage}>
      <h1>{t('settings.title')}</h1>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor="privacy-profile">{t('settings.profile')}</label>
        <input id="privacy-profile" value={profilePath} disabled={busy} required spellCheck={false}
          aria-describedby="profile-help" onChange={(event) => { setProfilePath(event.target.value); setMessage(''); }} />
        <p id="profile-help">{t('settings.profileHelp')}</p>
        <label htmlFor="video-scale">{t('settings.videoScale')}</label>
        <input id="video-scale" type="number" min="0.1" max="1" step="any" required
          value={videoScale} disabled={busy} aria-describedby="video-scale-help"
          onChange={(event) => { setVideoScale(event.target.value); setMessage(''); }} />
        <p id="video-scale-help">{t('settings.videoScaleHelp')}</p>
        <fieldset className={styles['click-timing']}>
          <legend>{t('settings.clickTiming')}</legend>
          <label htmlFor="click-quiet-seconds">{t('settings.clickQuiet')}</label>
          <input id="click-quiet-seconds" type="number" min="0.001" step="0.001" required
            value={quietSeconds} disabled={busy} aria-describedby="click-quiet-help"
            onChange={(event) => { setQuietSeconds(event.target.value); setMessage(''); }} />
          <p id="click-quiet-help">{t('settings.clickQuietHelp')}</p>
          <label htmlFor="click-maximum-seconds">{t('settings.clickMaximum')}</label>
          <input id="click-maximum-seconds" type="number" min="0.001" step="0.001" required
            value={maximumSeconds} disabled={busy} aria-describedby="click-maximum-help"
            onChange={(event) => { setMaximumSeconds(event.target.value); setMessage(''); }} />
          <p id="click-maximum-help">{t('settings.clickMaximumHelp')}</p>
        </fieldset>
        <label htmlFor="extension-language">{t('settings.language')}</label>
        <select id="extension-language" value={language} disabled={busy}
          onChange={(event) => { setLanguage(event.target.value as ReportLanguage); setMessage(''); }}>
          <option value="de">{t('settings.german')}</option>
          <option value="en">{t('settings.english')}</option>
        </select>
        <label htmlFor="report-tags">{t('settings.tags')}</label>
        <textarea id="report-tags" value={tags} disabled={busy} rows={5} spellCheck={false}
          aria-describedby="tags-help" onChange={(event) => { setTags(event.target.value); setMessage(''); }} />
        <p id="tags-help">{t('settings.tagsHelp')}</p>
        <div className={styles['settings-actions']}>
          <Button type="submit" variant="primary" disabled={busy}>{t('settings.save')}</Button>
          <Button disabled={busy} onClick={() => void save(true)}>{t('settings.restore')}</Button>
        </div>
      </form>
      {error && <p role="alert">{t(error.kind === 'load' ? 'settings.loadFailed' : 'settings.saveFailed', { detail: error.detail ?? t('settings.unknownError') })}</p>}
      <p role="status">{busy ? t('settings.loading') : message && t(message)}</p>
    </main>
  );
}
