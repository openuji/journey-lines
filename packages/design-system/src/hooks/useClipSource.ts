import { useEffect, useState } from 'react';
import { decodeBase64, type Clip } from '@openuji/core';

/** Own one browser media URL for the lifetime of a clip consumer. */
export function useClipSource(clip: Pick<Clip, 'base64' | 'mimeType'>): string | null {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([decodeBase64(clip.base64)], { type: clip.mimeType }));
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [clip.base64, clip.mimeType]);

  return source;
}
