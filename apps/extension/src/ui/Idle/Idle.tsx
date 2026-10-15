import { useEffect, useState } from 'react';
import { Button, useTranslation } from '@journey-lines/design-system';
import type { RecordOptions } from '../../lib/protocol';
import styles from './Idle.module.css';

/** Before a recording: one button, for the tab in front of the person, and how to record it. */
export function Idle({
  failed,
  onRecord,
}: {
  /** The last attempt failed; the button is usable again. */
  failed: boolean;
  onRecord: (tabId: number, options: RecordOptions) => void;
}) {
  const { t } = useTranslation();
  // Off by default: each scroll and each press is its before and after screenshots.
  const [video, setVideo] = useState(false);
  // Between the click and the worker's answer, a second click would only
  // collide with the first.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (failed) setPending(false);
  }, [failed]);

  const record = async (): Promise<void> => {
    setPending(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) {
      setPending(false);
      return;
    }
    onRecord(tab.id, { video });
  };

  return (
    <section className={styles['idle']}>
      <Button
        className={styles['record-button']}
        variant="primary"
        disabled={pending}
        onClick={() => void record()}
      >
        <span className={styles['record-icon']} aria-hidden />
        {t('idle.record')}
      </Button>
      <p className={styles['hint']}>{t('idle.hint')}</p>
      <label className={styles['option']}>
        <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
        {t('idle.video')}
      </label>
    </section>
  );
}
