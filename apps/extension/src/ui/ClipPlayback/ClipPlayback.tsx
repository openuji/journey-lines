import type { Clip } from '@openuji/core';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import { PlaybackToggle } from '../PlaybackToggle/PlaybackToggle';
import { usePlayback } from '../hooks/usePlayback';

export type ClipPlaybackProps = Readonly<{
  clip: Clip;
  className?: string;
  videoClassName?: string;
}>;

/** Playback visibility belongs to the control, not the surrounding row. */
export function ClipPlayback({ clip, className, videoClassName }: ClipPlaybackProps) {
  const { playing, controlsId, toggle } = usePlayback();

  return (
    <>
      <PlaybackToggle playing={playing} controlsId={controlsId} onToggle={toggle} className={className} />
      {playing && <ClipPlaybackPanel clip={clip} id={controlsId} className={videoClassName} />}
    </>
  );
}
