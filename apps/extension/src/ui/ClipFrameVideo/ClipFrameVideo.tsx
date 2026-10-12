import clsx from 'clsx';
import { usePreviewVideo } from '../../hooks/usePreviewVideo';
import styles from './ClipFrameVideo.module.css';

export type ClipFrameVideoProps = Readonly<{
  source: string | null;
  seconds: number;
  announceStatus?: boolean;
}>;

export function ClipFrameVideo({ source, seconds, announceStatus = true }: ClipFrameVideoProps) {
  const { videoRef, status, seekLatest, fail } = usePreviewVideo(source, seconds);
  return (
    <div className={clsx(styles['clip-frame-video'], styles[`clip-frame-video--${status}`])}>
      {source && (
        <video
          ref={videoRef}
          src={source}
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
      {status !== 'ready' && (
        <span role={announceStatus ? 'status' : undefined} aria-hidden={!announceStatus || undefined}>
          {status === 'error' ? 'Frame unavailable' : 'Loading frame…'}
        </span>
      )}
    </div>
  );
}
