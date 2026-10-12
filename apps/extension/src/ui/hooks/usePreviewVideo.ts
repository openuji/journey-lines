import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeBase64, type Clip } from '@openuji/core';

/** The only imperative adapter: the media element decodes and seeks frames. */
export function usePreviewVideo(clip: Clip, seconds: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([decodeBase64(clip.base64)], { type: clip.mimeType }));
    setSrc(url);
    setStatus('loading');
    return () => URL.revokeObjectURL(url);
  }, [clip]);

  const seekLatest = useCallback(() => {
    const video = videoRef.current;
    if (video?.error) { setStatus('error'); return; }
    if (!video || video.readyState < 1 || video.seeking) return;
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.0001) : seconds;
    const target = Math.min(seconds, end);
    if (Math.abs(video.currentTime - target) < 0.00005) {
      setStatus('ready');
      return;
    }
    setStatus('loading');
    video.currentTime = target;
  }, [seconds]);

  // A running seek is left alone. Its seeked handler uses the latest target,
  // coalescing pointer updates into one pending seek rather than a frame queue.
  useEffect(() => {
    setStatus('loading');
    seekLatest();
  }, [src, seekLatest]);

  return { videoRef, src, status, seekLatest, fail: () => setStatus('error') };
}
