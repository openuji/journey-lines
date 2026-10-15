import type { PlayableClip } from '../../lib/playable-clip';
import { FrameGallery, type GalleryFrame } from '../FrameGallery/FrameGallery';
import { TransitionMedia } from '../TransitionMedia/TransitionMedia';


export type StepMediaProps = Readonly<{
  frames: readonly GalleryFrame[];
  clip?: PlayableClip;
  className?: string;
  expandedClassName?: string;
  videoClassName?: string;
}>;

/** A step's pictures: before and after with the clip between them, or the frames on their own. */
export function StepMedia({ frames, clip, className, expandedClassName, videoClassName }: StepMediaProps) {
  const [before, after] = frames;
  return before && after
    ? (
      <TransitionMedia
        before={before}
        after={after}
        clip={clip}
        className={className}
        expandedClassName={expandedClassName}
        videoClassName={videoClassName}
      />
    )
    : <FrameGallery frames={frames} className={className} expandedClassName={expandedClassName} />;
}
