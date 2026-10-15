import { useEffect, useMemo, useState } from 'react';
import { decodeBase64 } from '@journey-lines/core';
import { itemFile, type StoredRecording } from '@journey-lines/journey';
import type { ReaderMedia } from '../ui/ReaderDocument/ReaderStep';

/**
 * The named archive files of an in-memory recording, as a reader loads them:
 * pictures as data URLs, videos as blob URLs owned for as long as they are
 * asked for. The journeys app serves the same files instead.
 */
export function useRecordingMedia(recording: StoredRecording | null, files: readonly string[]): ReaderMedia {
  const key = files.join('\n');
  const items = useMemo(() => {
    const wanted = new Set(key.split('\n'));
    return (recording?.items ?? []).filter((item) => wanted.has(itemFile(item)));
  }, [recording, key]);

  const pictures = useMemo(() => Object.fromEntries(items.flatMap((item) => item.kind === 'capture'
    ? [[itemFile(item), `data:image/png;base64,${item.capture.frame.base64}`]]
    : [])), [items]);

  const [videos, setVideos] = useState<ReaderMedia>({});
  useEffect(() => {
    const urls = Object.fromEntries(items.flatMap((item) => item.kind === 'clip'
      ? [[itemFile(item), URL.createObjectURL(new Blob([decodeBase64(item.clip.base64)], { type: item.clip.mimeType }))]]
      : []));
    setVideos(urls);
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
      setVideos({});
    };
  }, [items]);

  return useMemo(() => ({ ...pictures, ...videos }), [pictures, videos]);
}
