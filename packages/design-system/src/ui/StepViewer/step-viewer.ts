import type { LucideIcon } from 'lucide-react';
import type { PlayableClip } from '../../lib/playable-clip';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';

/** Something written about the phase a step belongs to, as the reader shows it. */
export type ViewerStatement = Readonly<{ label: string; text: string; tone?: 'plain' | 'problem' }>;

/** The phase a step belongs to: its number and title, where and how long, and what was written about it. */
export type ViewerPhase = Readonly<{
  number: number;
  /** What a phase is called, such as "Phase". */
  name: string;
  title: string;
  /** Duration · sites · steps, as one line. */
  facts: string;
  statements: readonly ViewerStatement[];
}>;

/** One step as the viewer shows it, large: what happened, where and when, and its pictures. */
export type ViewerSlide = Readonly<{
  key: string;
  /** What happened, as the step's label and icon say it. */
  title: string;
  icon: LucideIcon;
  note: string;
  phase?: ViewerPhase;
  /** When it happened, since the recording began, and the full address. */
  time: string;
  url: string;
  /** One frame for a page; before and after for an interaction. */
  frames: readonly GalleryFrame[];
  /** Only a clip that can be played. */
  clip?: PlayableClip;
}>;

/** How a slide is looked at: its frame, or an interaction's before, clip, or after. */
export type ViewerView = 'frame' | 'before' | 'after' | 'video';

/** Which slide is open, and how. */
export type ViewerAt = Readonly<{ index: number; view: ViewerView }>;

const isTransition = (slide: ViewerSlide) => slide.frames.length > 1;

/** The ways to look at a slide, in the order they happened. */
export function slideViews(slide: ViewerSlide): ViewerView[] {
  return isTransition(slide) ? ['before', ...(slide.clip ? ['video' as const] : []), 'after'] : ['frame'];
}

/** What a slide opens on when it is stepped to: an interaction's clip when it has one. */
export function defaultView(slide: ViewerSlide): ViewerView {
  if (!isTransition(slide)) return 'frame';
  return slide.clip ? 'video' : 'before';
}

/** The picture a view shows; none for the clip. */
export function viewFrame(slide: ViewerSlide, view: ViewerView): GalleryFrame | undefined {
  if (view === 'video') return undefined;
  return view === 'after' ? slide.frames[1] : slide.frames[0];
}
