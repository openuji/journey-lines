/**
 * Stills of a clip, from one load of its video: seek to each time in turn and
 * keep what the frame shows, scaled to `width`. The only imperative media code
 * the filmstrip needs; aborting stops the load.
 */
export async function captureStills(
  src: string,
  seconds: readonly number[],
  width: number,
  signal: AbortSignal,
): Promise<string[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  signal.addEventListener('abort', () => {
    video.removeAttribute('src');
    video.load();
  });
  video.src = src;
  await settled(video, 'loadeddata', signal);

  const canvas = document.createElement('canvas');
  const stills: string[] = [];
  for (const time of seconds) {
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.0001) : time;
    const target = Math.min(time, end);
    if (Math.abs(video.currentTime - target) > 0.00005) {
      video.currentTime = target;
      await settled(video, 'seeked', signal);
    }
    canvas.width = width;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    stills.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return stills;
}

/** The next `type` event, or the media error or abort that comes first. */
function settled(video: HTMLVideoElement, type: 'loadeddata' | 'seeked', signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (outcome: () => void) => () => {
      video.removeEventListener(type, onEvent);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onError);
      outcome();
    };
    const onEvent = done(resolve);
    const onError = done(() => reject(signal.aborted ? signal.reason : new Error('The clip could not be decoded.')));
    video.addEventListener(type, onEvent);
    video.addEventListener('error', onError);
    signal.addEventListener('abort', onError);
  });
}
