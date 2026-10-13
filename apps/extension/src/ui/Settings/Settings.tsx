import { useEffect, useState } from 'react';
import { loadSettings, restoreDefaultSettings, saveSettings } from '../../lib/settings';
import { Button } from '../Button/Button';
import styles from './Settings.module.css';

export function Settings() {
  const [profilePath, setProfilePath] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadSettings().then((settings) => setProfilePath(settings.privacy.profilePath))
      .catch(() => setError('Settings could not be loaded. Restore defaults or choose a profile.'))
      .finally(() => setBusy(false));
  }, []);

  const save = async (restore = false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      if (restore) setProfilePath((await restoreDefaultSettings()).privacy.profilePath);
      else await saveSettings({ privacy: { profilePath } });
      setMessage(restore ? 'Defaults restored. Applies to the next recording.' : 'Saved. Applies to the next recording.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally { setBusy(false); }
  };

  return (
    <main className={styles['settings']}>
      <h1>Recorder settings</h1>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label htmlFor="privacy-profile">Privacy profile</label>
        <input id="privacy-profile" value={profilePath} disabled={busy} required spellCheck={false}
          aria-describedby="profile-help" onChange={(event) => { setProfilePath(event.target.value); setMessage(''); }} />
        <p id="profile-help">Path to a JSON-LD file included in this extension’s privacy folder. Changes apply to the next recording.</p>
        <div className={styles['settings-actions']}>
          <Button type="submit" variant="primary" disabled={busy}>Save</Button>
          <Button disabled={busy} onClick={() => void save(true)}>Restore defaults</Button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
    </main>
  );
}
