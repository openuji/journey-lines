import type { PlayableClip } from '../../lib/playable-clip';
import { ClipVideo } from '../ClipVideo/ClipVideo';
import styles from './ClipPlaybackPanel.module.css';

export function ClipPlaybackPanel({ clip, id, className }: Readonly<{ clip: PlayableClip; id: string; className?: string }>) {
  return (
    <div id={id} className={className}>
      <ClipVideo clip={clip} className={styles['clip-playback__player']!} autoPlay />
    </div>
  );
}
