import { useEffect, useState } from 'react';
import { decodeBase64, type Clip } from '@openuji/core';

/** Own one browser media URL for an inline clip, for as long as its consumer is mounted. */
export function useClipSource(clip: Pick<Clip, 'base64' | 'mimeType'> | undefined): string | null {
  const [source, setSource] = useState<string | null>(null);
  const base64 = clip?.base64;
  const mimeType = clip?.mimeType;

  useEffect(() => {
    if (base64 === undefined) return;
    const url = URL.createObjectURL(new Blob([decodeBase64(base64)], { type: mimeType }));
    setSource(url);
    return () => {
      URL.revokeObjectURL(url);
      setSource(null);
    };
  }, [base64, mimeType]);

  return source;
}
