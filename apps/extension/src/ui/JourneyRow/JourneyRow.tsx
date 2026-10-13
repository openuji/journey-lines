import type { ReactNode } from 'react';
import { AppWindow, ArrowDownUp, Globe, LogOut, MousePointerClick, Route, Square, type LucideIcon } from 'lucide-react';
import type { CompositorFrame, ViewEntry } from '@openuji/core';
import { formatClock, shortUrl } from '../../lib/journey';
import type { JourneyEvent } from '../../lib/journey-events';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import { TimelineRow } from '../TimelineRow/TimelineRow';

type Presentation = Readonly<{ title: string; icon: LucideIcon }>;

const pagePresentation: Readonly<Record<ViewEntry, Presentation>> = {
  load: { title: 'Page loaded', icon: Globe },
  route: { title: 'Page changed', icon: Route },
  tab: { title: 'Switched tab', icon: AppWindow },
};

export function presentation(event: JourneyEvent): Presentation {
  switch (event.kind) {
    case 'page': return pagePresentation[event.entry];
    case 'click': return { title: 'Click', icon: MousePointerClick };
    case 'scroll': return { title: 'Scroll', icon: ArrowDownUp };
    case 'exit': return event.reason === 'recording-ended'
      ? { title: 'Recording ended', icon: Square } : { title: 'Left page', icon: LogOut };
  }
}

function galleryFrame(id: string, label: string, frame?: CompositorFrame, caption?: string): GalleryFrame {
  return {
    id, label, caption,
    ...(frame ? { src: `data:image/png;base64,${frame.base64}` } : {}),
  };
}

function media(event: JourneyEvent, title: string) {
  if (event.kind === 'page' || event.kind === 'exit') {
    return { frames: [galleryFrame('frame', title, event.frame)] };
  }
  return {
    frames: [
      galleryFrame('before', 'Before', event.before, 'Before'),
      galleryFrame('after', 'After', event.after, 'After'),
    ],
    clip: event.clip,
  };
}

/** Translate a normalized event into UI props; all controls live in ui/. */
export function EventRow({ event, children }: { event: JourneyEvent; children?: ReactNode }) {
  const props = presentation(event);
  const subtitle = event.kind === 'page'
    ? { text: shortUrl(event.url), title: event.url } : undefined;
  return (
    <TimelineRow
      {...props}
      {...media(event, props.title)}
      time={formatClock(event.atMs)}
      tone={event.kind}
      subtitle={subtitle}
    >
      {children}
    </TimelineRow>
  );
}
