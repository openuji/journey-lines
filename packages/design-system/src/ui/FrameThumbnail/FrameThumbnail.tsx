import { useTranslation } from '../../localisation/TranslationProvider';
import styles from './FrameThumbnail.module.css';

export type FrameThumbnailProps = Readonly<{
  src?: string;
  label: string;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
}>;

/** A controlled screenshot endpoint; selection belongs to its gallery. */
export function FrameThumbnail({ src, label, expanded, controlsId, onToggle }: FrameThumbnailProps) {
  const { t } = useTranslation();
  const parameters = { label, labelLower: label.toLowerCase() };
  return (
    <div className={styles['frame-thumbnail']}>
      {src ? (
        <button
          type="button"
          className={styles['frame-thumbnail__button']}
          aria-label={t(expanded ? 'media.collapseFrame' : 'media.expandFrame', parameters)}
          data-action-label={t(expanded ? 'media.collapse' : 'media.expand')}
          aria-expanded={expanded}
          aria-controls={controlsId}
          onClick={onToggle}
        >
          <img src={src} alt="" loading="lazy" />
        </button>
      ) : <span className={styles['frame-thumbnail__unavailable']} aria-label={t('media.unavailableFrame', parameters)}>{t('media.unavailable')}</span>}
    </div>
  );
}
