import clsx from 'clsx';
import { Play } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './PlaybackToggle.module.css';

export type PlaybackToggleProps = Readonly<{
  playing: boolean;
  controlsId: string;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
}>;

export function PlaybackToggle({ playing, controlsId, onToggle, compact = false, className }: PlaybackToggleProps) {
  const label = playing ? 'Hide video' : 'Play video';
  return (
    <Button
      size="small"
      className={clsx(
        styles['clip-playback__toggle'],
        compact && styles['clip-playback__toggle--compact'],
        className,
      )}
      aria-label={label}
      aria-expanded={playing}
      aria-controls={controlsId}
      title={label}
      onClick={onToggle}
    >
      <Play aria-hidden />
      {!compact && label}
    </Button>
  );
}
