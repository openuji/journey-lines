import { useId, useState } from 'react';
import { Play } from 'lucide-react';
import type { Clip } from '@openuji/core';
import { Button } from './Button';
import { ClipVideo } from './ClipVideo';

export type ClipPlaybackProps = Readonly<{
  clip: Clip;
  className?: string;
  videoClassName?: string;
}>;

/** Playback visibility belongs to the control, not the surrounding row. */
export function ClipPlayback({ clip, className, videoClassName }: ClipPlaybackProps) {
  const [playing, setPlaying] = useState(false);
  const videoId = `clip-playback-${useId().replaceAll(':', '')}`;

  return (
    <>
      <Button
        size="small"
        className={['clip-playback__toggle', className].filter(Boolean).join(' ')}
        aria-expanded={playing}
        aria-controls={videoId}
        onClick={() => setPlaying((current) => !current)}
      >
        <Play size={12} aria-hidden />
        {playing ? 'Hide video' : 'Play video'}
      </Button>
      {playing && (
        <div id={videoId} className={['clip-playback__video', videoClassName].filter(Boolean).join(' ')}>
          <ClipVideo clip={clip} className="clip-playback__player" autoPlay />
        </div>
      )}
    </>
  );
}
