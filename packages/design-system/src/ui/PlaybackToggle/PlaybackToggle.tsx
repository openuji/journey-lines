import { useTranslation } from '../../localisation/TranslationProvider';
import clsx from 'clsx';
import { Play, X } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './PlaybackToggle.module.css';

export type PlaybackToggleProps = Readonly<{
  open: boolean;
  controlsId: string;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
}>;

export function PlaybackToggle({ open, controlsId, onToggle, compact = false, className }: PlaybackToggleProps) {
  const { t } = useTranslation();
  const label = t(open ? 'media.hideVideo' : 'media.playVideo');
  return (
    <Button
      size="small"
      className={clsx(
        styles['clip-playback__toggle'],
        compact && styles['clip-playback__toggle--compact'],
        className,
      )}
      aria-label={label}
      aria-expanded={open}
      aria-controls={controlsId}
      title={label}
      onClick={onToggle}
    >
      {open ? <X aria-hidden /> : <Play aria-hidden />}
      {!compact && label}
    </Button>
  );
}
