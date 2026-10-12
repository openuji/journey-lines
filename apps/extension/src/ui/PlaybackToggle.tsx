import { Play } from 'lucide-react';
import { Button } from './Button';

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
      className={['clip-playback__toggle', compact && 'clip-playback__toggle--compact', className].filter(Boolean).join(' ')}
      aria-label={label}
      aria-expanded={playing}
      aria-controls={controlsId}
      title={label}
      onClick={onToggle}
    >
      <Play size={12} aria-hidden />
      {!compact && label}
    </Button>
  );
}
