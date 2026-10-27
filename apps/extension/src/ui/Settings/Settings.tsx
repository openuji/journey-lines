import { useEffect, useState } from 'react';
import { Button, useTranslation } from '@journey-lines/design-system';
import { cleanTags, defaultExtensionLanguage, loadSettings, restoreDefaultSettings, saveSettings } from '../../lib/settings';
import styles from './Settings.module.css';
import type { ReportLanguage } from '@journey-lines/journey';
import { WEBM_DEFAULTS } from '@journey-lines/clip-webm';

export function Settings() {
  const { t, language: uiLanguage } = useTranslation();
  const [profilePath, setProfilePath] = useState('');
  const [tags, setTags] = useState('');
  const [videoScale, setVideoScale] = useState(String(WEBM_DEFAULTS.scale));
  const [language, setLanguage] = useState<ReportLanguage>(uiLanguage === 'en' ? 'en' : defaultExtensionLanguage);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<{ kind: 'load' | 'save'; detail?: string } | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadSettings().then((settings) => {
      setProfilePath(settings.privacy.profilePath);
      setTags(settings.report.tags.join('\n'));
      setVideoScale(String(settings.video.scale));
      setLanguage(settings.report.language);
    })
      .catch(() => setError({ kind: 'load' }))
      .finally(() => setBusy(false));
  }, []);

  const save = async (restore = false) => {
    setBusy(true); setError(null); setMessage('');
    try {
      if (restore) {
        const defaults = await restoreDefaultSettings();
        setProfilePath(defaults.privacy.profilePath);
        setTags(defaults.report.tags.join('\n'));
        setVideoScale(String(defaults.video.scale));
        setLanguage(defaults.report.language);
      } else await saveSettings({
        privacy: { profilePath }, report: { language, tags: cleanTags(tags.split('\n')) },
        video: { scale: Number(videoScale) },
      });
      setMessage(restore ? 'settings.restored' : 'settings.saved');
    } catch (error) {
      setError({ kind: 'save', detail: error instanceof Error ? error.message : undefined });
    } finally { setBusy(false); }
  };

  return (
    <main className={styles['settings']}>
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
