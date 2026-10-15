import type { PlayableClip } from '../../lib/playable-clip';
import { useVideoDisclosure } from '../../hooks/useVideoDisclosure';
import { ClipFilmstrip } from '../ClipFilmstrip/ClipFilmstrip';
import { clipDurationMs, frameTimeLabel } from '../ClipFilmstrip/clip-filmstrip';
import { ClipPlaybackPanel } from '../ClipPlaybackPanel/ClipPlaybackPanel';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import { FramePair } from '../FramePair/FramePair';
import { FrameThumbnail } from '../FrameThumbnail/FrameThumbnail';
import { PlaybackToggle } from '../PlaybackToggle/PlaybackToggle';
import type { ViewerSlide, ViewerView } from '../StepViewer/step-viewer';
import styles from './ReaderDocument.module.css';

export type ReaderStepMediaProps = Readonly<{
  slide: ViewerSlide;
  /** The viewer every picture opens in. */
  viewerId: string;
  onOpen: (view: ViewerView) => void;
}>;

/**
 * A step's pictures in the storyboard: each opens the viewer, large; a clip
 * plays right here, as wide as the pictures' column.
 */
export function ReaderStepMedia({ slide, viewerId, onOpen }: ReaderStepMediaProps) {
  const [first, second] = slide.frames;
  return first && second
    ? <Transition before={first} after={second} clip={slide.clip} viewerId={viewerId} onOpen={onOpen} />
    : (
      <div className={styles['reader-step__media']}>
        {slide.frames.map((frame) => (
          <FrameThumbnail
            key={frame.id}
            src={frame.src}
            label={frame.label}
            expanded={false}
            controlsId={viewerId}
            onToggle={() => onOpen('frame')}
          />
        ))}
      </div>
    );
}

function Transition({ before, after, clip, viewerId, onOpen }: Readonly<{
  before: GalleryFrame;
  after: GalleryFrame;
  clip?: PlayableClip;
  viewerId: string;
  onOpen: (view: ViewerView) => void;
}>) {
  const { open, controlsId, toggle } = useVideoDisclosure();
  return (
    <div className={styles['reader-step__media']}>
      <FramePair
        before={before}
        after={after}
        expanded={null}
        controlsId={viewerId}
        onToggle={onOpen}
        aside={clip && (
          <div className={styles['reader-step__controls']}>
            <PlaybackToggle open={open} controlsId={controlsId} onToggle={toggle} compact />
            <span className={styles['reader-step__duration']}>{frameTimeLabel(clipDurationMs(clip.trace))}</span>
          </div>
        )}
      >
        {clip && <ClipFilmstrip clip={clip} previewEnabled={!open} />}
      </FramePair>
      {open && clip && <ClipPlaybackPanel clip={clip} id={controlsId} className={styles['reader-step__video']} />}
    </div>
  );
}
