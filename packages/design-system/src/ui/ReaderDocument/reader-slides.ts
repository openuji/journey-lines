import { formatClock, mapEventMedia, type EntryStep, type FiledClip, type JourneyEntry } from '@openuji/journey';
import { translateEnglish, type Translator } from '../../localisation/translate';
import type { PlayableClip } from '../../lib/playable-clip';
import { eventMedia, presentation, type PlayableEvent } from '../JourneyRow/JourneyRow';
import type { ViewerPhase, ViewerSlide } from '../StepViewer/step-viewer';
import { phaseFacts, phaseTitle, type PhaseSection, type ReaderSection } from './reader-sections';

/** Where each archive file the report shows can be loaded from. */
export type ReaderMedia = Readonly<Record<string, string>>;

const playableClip = (media: ReaderMedia) => (clip: FiledClip): PlayableClip | undefined => {
  const src = media[clip.file];
  return src === undefined ? undefined : { src, trace: clip.trace };
};

/**
 * Every step the report shows, in reading order, as its pictures open in the
 * viewer: with the phase it belongs to, told the way the phase's head tells it.
 */
export function readerSlides(
  entry: JourneyEntry,
  sections: readonly ReaderSection[],
  media: ReaderMedia,
  t: Translator = translateEnglish,
  dir: 'ltr' | 'rtl' = 'ltr',
): ViewerSlide[] {
  return sections.flatMap((section) => {
    const phase = section.kind === 'phase' ? viewerPhase(entry, section, t, dir) : undefined;
    return section.steps.map((step) => stepSlide(step, phase, media, t));
  });
}

function viewerPhase(entry: JourneyEntry, section: PhaseSection, t: Translator, dir: 'ltr' | 'rtl'): ViewerPhase {
  const { phase } = section;
  const { name, happened, problem } = entry.phaseWording;
  return {
    number: phase.number,
    name,
    title: phaseTitle(entry, phase),
    facts: phaseFacts(section, t, dir).join(' · '),
    statements: [
      ...(phase.happened ? [{ label: happened, text: phase.happened }] : []),
      ...(phase.problem ? [{ label: problem, text: phase.problem, tone: 'problem' as const }] : []),
    ],
  };
}

function stepSlide(step: EntryStep, phase: ViewerPhase | undefined, media: ReaderMedia, t: Translator): ViewerSlide {
  const { event, note } = step;
  const { title, icon } = presentation(event, t);
  const playable: PlayableEvent = mapEventMedia(event, (file) => media[file], playableClip(media));
  const { frames, clip } = eventMedia(playable, title, t);
  return {
    key: event.key,
    title,
    icon,
    note,
    ...(phase ? { phase } : {}),
    time: formatClock(event.atMs),
    url: event.url,
    frames,
    ...(clip && clip.trace.length > 0 ? { clip } : {}),
  };
}
