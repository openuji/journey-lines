import { useCallback, useEffect, useRef, useState } from 'react';

/** The only imperative adapter: the media element decodes and seeks frames. */
export function usePreviewVideo(source: string | null, seconds: number) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

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
  }, [source, seekLatest]);

  return { videoRef, status, seekLatest, fail: () => setStatus('error') };
}
