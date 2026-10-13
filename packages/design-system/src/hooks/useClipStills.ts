import { useEffect, useRef, useState } from 'react';
import { captureStills } from '../lib/clip-stills';

export type ClipStills = Readonly<{ status: 'waiting' | 'ready' | 'failed'; stills: readonly string[] }>;

const waiting: ClipStills = { status: 'waiting', stills: [] };

/**
 * Stills of a clip at `seconds`, captured once its element comes near the
 * screen: one load of the video for all of them, none for clips never seen.
 */
export function useClipStills(src: string, seconds: readonly number[], width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<ClipStills>(waiting);
  const key = seconds.join(' ');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      captureStills(src, key.split(' ').map(Number), width, controller.signal).then(
        (stills) => setResult({ status: 'ready', stills }),
        () => { if (!controller.signal.aborted) setResult({ status: 'failed', stills: [] }); },
      );
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => {
      observer.disconnect();
      controller.abort();
      setResult(waiting);
    };
  }, [src, key, width]);

  return { ref, ...result };
}
