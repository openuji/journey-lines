import type { Clip } from '@openuji/core';
import { useClipSource } from '../../hooks/useClipSource';

/** A Blob URL exists only while its player is mounted. */
export function ClipVideo({ clip, className, autoPlay = false }: { clip: Clip; className: string; autoPlay?: boolean }) {
  const source = useClipSource(clip);

  return source && <video className={className} src={source} controls autoPlay={autoPlay} muted={autoPlay} playsInline preload="metadata" />;
}
