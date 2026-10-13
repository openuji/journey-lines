import type { PlayableClip } from '../../lib/playable-clip';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import { PlaybackToggle } from '../PlaybackToggle/PlaybackToggle';
import { useVideoDisclosure } from '../../hooks/useVideoDisclosure';

export type ClipPlaybackProps = Readonly<{
  clip: PlayableClip;
  className?: string;
  videoClassName?: string;
}>;

/** Playback visibility belongs to the control, not the surrounding row. */
export function ClipPlayback({ clip, className, videoClassName }: ClipPlaybackProps) {
  const { open, controlsId, toggle } = useVideoDisclosure();

  return (
    <>
      <PlaybackToggle open={open} controlsId={controlsId} onToggle={toggle} className={className} />
      {open && <ClipPlaybackPanel clip={clip} id={controlsId} className={videoClassName} />}
    </>
  );
}
