import { useTranslation } from '../../localisation/TranslationProvider';
import { translateEnglish, type Translator } from '../../localisation/translate';
import type { ReactNode } from 'react';
import { AppWindow, ArrowDownUp, Globe, LogOut, MousePointerClick, Route, Square, type LucideIcon } from 'lucide-react';
import type { CompositorFrame, ViewEntry } from '@openuji/core';
import { formatClock, mapEventMedia, shortUrl, type JourneyEvent } from '@openuji/journey';
import { useClipSource } from '../../hooks/useClipSource';
import type { PlayableClip } from '../../lib/playable-clip';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import { TimelineRow } from '../TimelineRow/TimelineRow';

type Presentation = Readonly<{ title: string; icon: LucideIcon }>;

/** An event whose pictures and video are URLs a browser loads; one may not be there (yet). */
export type PlayableEvent = JourneyEvent<string | undefined, PlayableClip | undefined>;

/** What a step is called and drawn as, whatever form its media take. */
export function presentation(event: JourneyEvent<unknown, unknown>, t: Translator = translateEnglish): Presentation {
  const pagePresentation: Readonly<Record<ViewEntry, Presentation>> = {
    load: { title: t('event.pageLoaded'), icon: Globe },
    route: { title: t('event.pageChanged'), icon: Route },
    tab: { title: t('event.switchedTab'), icon: AppWindow },
  };
  switch (event.kind) {
    case 'page': return pagePresentation[event.entry];
    case 'click': return { title: t('event.click'), icon: MousePointerClick };
    case 'scroll': return { title: t('event.scroll'), icon: ArrowDownUp };
    case 'exit': return event.reason === 'recording-ended'
      ? { title: t('event.recordingEnded'), icon: Square } : { title: t('event.leftPage'), icon: LogOut };
  }
}

function galleryFrame(id: string, label: string, src?: string, caption?: string): GalleryFrame {
  return { id, label, caption, ...(src ? { src } : {}) };
}

/** The pictures and clip a step shows: one frame for a page or an exit; before, after and video for an interaction. */
export function eventMedia(event: PlayableEvent, title: string, t: Translator = translateEnglish): { frames: GalleryFrame[]; clip?: PlayableClip } {
  if (event.kind === 'page' || event.kind === 'exit') {
    return { frames: [galleryFrame('frame', title, event.frame)] };
  }
  return {
    frames: [
      galleryFrame('before', t('media.before'), event.before, t('media.before')),
      galleryFrame('after', t('media.after'), event.after, t('media.after')),
    ],
    clip: event.clip,
  };
}

const frameUrl = (frame: CompositorFrame): string => `data:image/png;base64,${frame.base64}`;

/** A recorded event as a row: its inline pictures and video become URLs here, and nowhere below. */
export function EventRow({ event, children }: Readonly<{
  event: JourneyEvent;
  children?: ReactNode;
}>) {
  const { t } = useTranslation();
  const props = presentation(event, t);
  const source = useClipSource(event.kind === 'click' || event.kind === 'scroll' ? event.clip : undefined);
  const playable: PlayableEvent = mapEventMedia(event, frameUrl, (clip) => source ? { src: source, trace: clip.trace } : undefined);
  const subtitle = event.kind === 'page'
    ? { text: shortUrl(event.url), title: event.url } : undefined;
  return (
    <TimelineRow
      {...props}
      {...eventMedia(playable, props.title, t)}
      time={formatClock(event.atMs)}
      tone={event.kind}
      subtitle={subtitle}
    >
      {children}
    </TimelineRow>
  );
}
