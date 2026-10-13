/**
 * The journey from changes/intent.md, "where do I have to go for the lecture",
 * as synthetic captures: real URLs and labels, the shared placeholder frame.
 * It runs through the side panel's own projection, so the events are real.
 */

import type { Clip, MilestoneCapture, TargetElementMeta, ViewEntry } from '@openuji/core';
import { journeyEvents } from '../lib/journey-events';
import type { RecordingItem, StoredRecording } from '../lib/recording-store';
import { emptyDraft, type ReportDraft } from '../lib/report-draft';
import { longStoryCaptures, STORY_FRAME, STORY_STARTED_AT_MS } from './fixtures';
import { storyTransitionClip } from './media';

const COURSE_URL = 'https://www.fu-berlin.de/vv/de/lv/123456';
const SEARCH_URL = 'https://www.google.com/search?q=Habelschwerdter+Allee+45+H%C3%B6rsaal+1b';
const HALL_URL = 'https://www.fu-berlin.de/sites/rosila/Gebaeude/Rostlaube/Hoersaal-1b/index.html';
const MAPS_URL = 'https://www.google.com/maps/place/Habelschwerdter+Allee+45,+14195+Berlin/@52.4529,13.2897,17z';

const views: Readonly<Record<number, Readonly<{ entry: ViewEntry; url: string }>>> = {
  1: { entry: 'load', url: COURSE_URL },
  2: { entry: 'load', url: SEARCH_URL },
  3: { entry: 'load', url: HALL_URL },
  // Maps opens in a second tab; the recording follows it.
  4: { entry: 'tab', url: MAPS_URL },
};

function target(tagName: string, selector: string): TargetElementMeta {
  return { tagName, selector, boundingRect: { x: 0, y: 0, width: 0, height: 0 } };
}

function capture(viewId: number, label: string, atS: number, detail: string, domTarget?: TargetElementMeta): MilestoneCapture {
  const { entry, url } = views[viewId]!;
  const receivedAtMs = STORY_STARTED_AT_MS + atS * 1000;
  return {
    viewId, entry, url, label, detail,
    documentId: viewId,
    loaderId: `campus-${viewId}`,
    ...(domTarget ? { domTarget } : {}),
    frame: {
      index: Math.round(atS * 10),
      base64: STORY_FRAME,
      scrollX: 0,
      scrollY: 0,
      viewportWidth: 1280,
      viewportHeight: 720,
      pageScaleFactor: 1,
      receivedAtMs,
    },
  };
}

export const campusCaptures: readonly MilestoneCapture[] = [
  // The course page: the address is below the fold.
  capture(1, '00-first', 1, 'First visual compositor frame for this document'),
  capture(1, '02-settled', 2.5, 'Settled'),
  capture(1, '03-pre-scroll-01', 6, 'Pre-scroll #1 of the page'),
  capture(1, '04-post-scroll-01', 7.5, 'Post-scroll #1 of the page'),
  capture(1, '99-before-navigation', 14, 'Navigation; preserving the final resting state'),
  // Google: search for the address, open the official result.
  capture(2, '00-first', 16, 'First visual compositor frame for this document'),
  capture(2, '02-settled', 17, 'Settled'),
  capture(2, '10-pre-click-01', 24, 'Pre-click state on <a> “Hörsaal 1b – Freie Universität Berlin”', target('a', 'a.result')),
  capture(2, '11-post-click-01', 25, 'Compositor response after clicking <a>'),
  capture(2, '99-before-navigation', 25.2, 'Navigation; preserving the final resting state'),
  // The lecture hall page: equipment and seats, no directions.
  capture(3, '00-first', 26, 'First visual compositor frame for this document'),
  capture(3, '02-settled', 27.5, 'Settled'),
  capture(3, '03-pre-scroll-01', 31, 'Pre-scroll #1 of the page'),
  capture(3, '04-post-scroll-01', 33, 'Post-scroll #1 of the page'),
  capture(3, '03-pre-scroll-02', 40, 'Pre-scroll #2 of the page'),
  capture(3, '04-post-scroll-02', 42, 'Post-scroll #2 of the page'),
  // Maps: the campus, but no entrance and no room.
  capture(4, '00-first', 50, 'First visual compositor frame for this document'),
  capture(4, '02-settled', 53, 'Settled'),
  capture(4, '10-pre-click-01', 58, 'Pre-click state on <button> “Zoom in”', target('button', 'button.zoom-in')),
  capture(4, '11-post-click-01', 59, 'Compositor response after clicking <button>'),
  // The recording ends before this click's response arrives: no after frame.
  capture(4, '10-pre-click-02', 66, 'Pre-click state on <canvas>', target('canvas', 'canvas')),
  capture(4, '99-before-navigation', 71, 'Session ending; preserving final resting state'),
];

const hallScrollClip: Clip = {
  ...storyTransitionClip,
  viewId: 3,
  entry: 'load',
  documentId: 3,
  loaderId: 'campus-3',
  url: HALL_URL,
  label: '04-post-scroll-01',
};

const campusItems: readonly RecordingItem[] = [
  ...campusCaptures.map((capture): RecordingItem => ({ kind: 'capture', epochMs: capture.frame.receivedAtMs, capture })),
  { kind: 'clip', epochMs: STORY_STARTED_AT_MS + 33_200, clip: hallScrollClip },
];

/** The same journey as the report page receives it: a completed recording, video included. */
export const campusRecording: StoredRecording = {
  meta: {
    id: 'ses_campus',
    tab: { id: 7, windowId: 1, title: 'Vorlesungsverzeichnis – Freie Universität Berlin', url: COURSE_URL },
    startedAtMs: STORY_STARTED_AT_MS,
    endedAtMs: STORY_STARTED_AT_MS + 71_000,
    endedBy: 'user',
    droppedFrames: 0,
  },
  // In arrival order, as the recorder stores them.
  items: [...campusItems].sort((a, b) => a.epochMs - b.epochMs),
};

/** Keys: page:1 scroll:1:01 exit:1 · page:2 click:2:01 exit:2 · page:3 scroll:3:01 scroll:3:02 · page:4 click:4:01 click:4:02 exit:4 */
export const campusEvents = journeyEvents(campusCaptures, STORY_STARTED_AT_MS, [hallScrollClip]);

export const longEvents = journeyEvents(longStoryCaptures, STORY_STARTED_AT_MS);

const campusFields: ReportDraft['fields'] = {
  subject: 'Journey 01 · Campus orientation · Freie Universität Berlin',
  title: 'Where is my lecture hall, actually?',
  goal: 'I want to find out how to get to lecture hall 1b, where my lecture takes place.',
  result: 'In the end I know where the building complex is, but not the way to the lecture hall.',
  insight: 'A correct address is not yet enough to find your way.\n\nThe course, the room’s equipment and the way to the room are spread over different services, and the step from one to the next isn’t visible to me.',
  idea: 'Right at the location and on the lecture hall page, link to a marked floor plan, ideally with the right entrance and the way from it.',
  scope: 'One exemplary attempt. It doesn’t show how often other students meet the same difficulty.',
};

/** Filled as in changes/overfitted-report.md: three phases, the "Left page" noise hidden. */
export const campusDraft: ReportDraft = {
  fields: campusFields,
  phases: {
    'page:1': {
      title: 'I find an address',
      happened: 'On the course page I find the location “Hs 1b Hörsaal, Habelschwerdter Allee 45”.',
      problem: 'The address names a place, but doesn’t explain how to find the room inside the building complex.',
    },
    'page:2': {
      title: 'I search for the lecture hall',
      happened: 'I search Google for the address and land on the official FU page for lecture hall 1b. It lists equipment, seats and technical facilities.',
      problem: 'I found the right page, but it gives me no directions to the room that I can see.',
    },
    'page:4': {
      title: 'I try to orient myself with Maps',
      happened: 'I open Google Maps and search for Habelschwerdter Allee 45.',
      problem: 'Maps helps me locate the building complex, but it doesn’t tell me which entrance to take or where lecture hall 1b is.',
    },
  },
  steps: {
    'scroll:1:01': { note: 'The address is the only hint at where the course takes place.' },
    'exit:1': { hidden: true },
    'exit:2': { hidden: true },
    'scroll:3:02': { note: 'Equipment and seats, but no floor plan and no way to the room.' },
    'click:4:02': { note: 'Zoomed in as far as it goes: the campus, but no entrances.' },
  },
};

/** Phases begin only at Google, so the course page stays ungrouped above them. */
export const ungroupedLeadDraft: ReportDraft = {
  ...campusDraft,
  phases: { 'page:2': campusDraft.phases['page:2']!, 'page:4': campusDraft.phases['page:4']! },
};

/** The Maps phase has its texts, but every one of its steps is hidden. */
export const phaseAllHiddenDraft: ReportDraft = {
  ...campusDraft,
  steps: {
    ...campusDraft.steps,
    'page:4': { hidden: true },
    'click:4:01': { hidden: true },
    'click:4:02': { hidden: true, note: 'A note on a hidden step.' },
    'exit:4': { hidden: true },
  },
};

const longWord = 'https://www.fu-berlin.de/sites/rosila/Gebaeude/Rostlaube/Hoersaal-1b/index.html?utm_source=a-very-long-query-that-never-breaks';

export const longTextDraft: ReportDraft = {
  fields: {
    ...campusFields,
    subject: 'Journey 01 · Campus orientation · Freie Universität Berlin · Fachbereich Geschichts- und Kulturwissenschaften · Wintersemester 2026/27',
    title: 'Where is my lecture hall, actually, and why does every service I try tell me only a part of the answer?',
    goal: `${campusFields['goal']} ${longWord}`,
  },
  phases: {
    'page:1': {
      title: 'I find an address, and it reads like a complete answer, which it isn’t, because the building complex has many entrances',
      happened: Array.from({ length: 4 }, () => campusDraft.phases['page:1']!.happened).join('\n\n'),
      problem: longWord,
    },
  },
  steps: {
    'page:1': { note: Array.from({ length: 6 }, () => 'A long note that wraps over several lines.').join(' ') },
  },
};

/** A phase at every page of the long fixture. */
export const manyPhasesDraft: ReportDraft = {
  ...emptyDraft,
  phases: Object.fromEntries(longEvents
    .filter((event) => event.kind === 'page')
    .map((event, index) => [event.key, { title: `View ${index + 1}` }])),
};
