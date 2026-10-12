import type { Clip } from '@openuji/core';
import { usePreviewVideo } from '../../hooks/usePreviewVideo';
import styles from './ClipFrameVideo.module.css';

export function ClipFrameVideo({ clip, seconds }: Readonly<{ clip: Clip; seconds: number }>) {
  const { videoRef, src, status, seekLatest, fail } = usePreviewVideo(clip, seconds);
  return (
    <div className={`${styles['clip-frame-video']} ${styles[`clip-frame-video--${status}`] ?? ''}`}>
      {src && (
        <video
          ref={videoRef}
          src={src}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={seekLatest}
          onLoadedData={seekLatest}
          onSeeked={seekLatest}
          onError={fail}
          aria-hidden
        />
      )}
      {status !== 'ready' && <span role="status">{status === 'error' ? 'Frame unavailable' : 'Loading frame…'}</span>}
    </div>
  );
}
