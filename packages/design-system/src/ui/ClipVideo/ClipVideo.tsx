import type { PlayableClip } from '../../lib/playable-clip';

export function ClipVideo({ clip, className, autoPlay = false }: { clip: PlayableClip; className: string; autoPlay?: boolean }) {
  return <video className={className} src={clip.src} controls autoPlay={autoPlay} muted={autoPlay} playsInline preload="metadata" />;
}
