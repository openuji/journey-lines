import type { Clip } from '@openuji/core';
import { ClipVideo } from './ClipVideo';

export function ClipPlaybackPanel({ clip, id, className }: Readonly<{ clip: Clip; id: string; className?: string }>) {
  return (
    <div id={id} className={['clip-playback__video', className].filter(Boolean).join(' ')}>
      <ClipVideo clip={clip} className="clip-playback__player" autoPlay />
    </div>
  );
}
