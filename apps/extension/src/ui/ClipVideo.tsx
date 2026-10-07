import { useEffect, useState } from 'react';
import { decodeBase64, type Clip } from '@openuji/core';

/** A Blob URL exists only while its player is mounted. */
export function ClipVideo({ clip, className, autoPlay = false }: { clip: Clip; className: string; autoPlay?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([decodeBase64(clip.base64)], { type: clip.mimeType }));
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);

  return src && <video className={className} src={src} controls autoPlay={autoPlay} muted={autoPlay} playsInline preload="metadata" />;
}
