import type { Clip, CompositorFrame, MilestoneCapture, ViewEntry } from '@journey-lines/core';
import { DocumentLabel } from '@journey-lines/rules-document';
import { InteractionLabel } from '@journey-lines/rules-interaction';
import type { StoredRecording } from './recording.js';

type EventBase = Readonly<{
  key: string;
  viewId: number;
  url: string;
  /** Since the recording started, on the captured frame's arrival clock. */
  atMs: number;
}>;

/*
 * An event holds its pictures as `F` and its video as `V`: inline in the
 * recording by default, or in any other form a reader needs, such as the
 * names of archive files or URLs. Which events there are never depends on it.
 */

export type PageJourneyEvent<F = CompositorFrame> = EventBase & Readonly<{
  kind: 'page';
  entry: ViewEntry;
  frame?: F;
}>;

export type InteractionJourneyEvent<F = CompositorFrame, V = Clip> = EventBase & Readonly<{
  kind: 'click' | 'scroll';
  before?: F;
  after?: F;
  clip?: V;
}>;

export type ExitJourneyEvent<F = CompositorFrame> = EventBase & Readonly<{
  kind: 'exit';
  reason: 'navigation' | 'recording-ended';
  frame: F;
}>;

/** Derived panel data only: never persisted or sent over the recorder port. */
export type JourneyEvent<F = CompositorFrame, V = Clip> =
  | PageJourneyEvent<F>
  | InteractionJourneyEvent<F, V>
  | ExitJourneyEvent<F>;

/** How the projection holds a capture's picture and a clip. */
export type EventMedia<F, V> = Readonly<{
  frame: (capture: MilestoneCapture) => F;
  clip: (clip: Clip) => V;
}>;

/** Media as the recording holds them. */
export const inlineMedia: EventMedia<CompositorFrame, Clip> = {
  frame: (capture) => capture.frame,
  clip: (clip) => clip,
};

type LoadingCapture = Readonly<{
  kind: 'loading';
  rank: number;
  capture: MilestoneCapture;
}>;

type InteractionCapture = Readonly<{
  kind: 'interaction';
  interactionKind: InteractionJourneyEvent['kind'];
  endpoint: 'before' | 'after';
  episode: string;
  postLabel: string;
  capture: MilestoneCapture;
}>;

type ExitCapture = Readonly<{
  kind: 'exit';
  reason: ExitJourneyEvent['reason'];
  capture: MilestoneCapture;
}>;

type ClassifiedCapture = LoadingCapture | InteractionCapture | ExitCapture;

type CaptureGroup<T, Key> = Readonly<{
  key: Key;
  first: T;
  items: readonly T[];
}>;

const loadingMilestones = [
  { label: DocumentLabel.first, rank: 1 },
  { label: DocumentLabel.domContentLoaded, rank: 2 },
  { label: DocumentLabel.settled, rank: 3 },
] as const;

const interactionMilestones = [
  { prefix: InteractionLabel.preClick, kind: 'click', endpoint: 'before', postPrefix: InteractionLabel.postClick },
  { prefix: InteractionLabel.postClick, kind: 'click', endpoint: 'after', postPrefix: InteractionLabel.postClick },
  { prefix: InteractionLabel.preScroll, kind: 'scroll', endpoint: 'before', postPrefix: InteractionLabel.postScroll },
  { prefix: InteractionLabel.postScroll, kind: 'scroll', endpoint: 'after', postPrefix: InteractionLabel.postScroll },
] as const;

function classifyInteraction(capture: MilestoneCapture): InteractionCapture | undefined {
  const milestone = interactionMilestones.find(({ prefix }) => capture.label.startsWith(`${prefix}-`));
  if (!milestone) return undefined;
  const episode = capture.label.slice(milestone.prefix.length + 1);
  if (!/^\d+$/.test(episode)) return undefined;
  return {
    kind: 'interaction',
    interactionKind: milestone.kind,
    endpoint: milestone.endpoint,
    episode,
    postLabel: `${milestone.postPrefix}-${episode}`,
    capture,
  };
}

function classifyCapture(capture: MilestoneCapture): ClassifiedCapture | undefined {
  const milestone = loadingMilestones.find(({ label }) => label === capture.label);
  if (milestone) return { kind: 'loading', rank: milestone.rank, capture };
  if (capture.label === DocumentLabel.beforeNavigation) {
    return {
      kind: 'exit',
      // The document rule's exact stop marker. Done status also follows
      // navigation to pages that cannot be recorded, so it is not an exit reason.
      reason: capture.detail === 'Session ending; preserving final resting state'
        ? 'recording-ended' : 'navigation',
      capture,
    };
  }
  return classifyInteraction(capture);
}

/** Preserve first arrival order while creating new groups for each update. */
function groupInArrivalOrder<T, Key>(
  items: readonly T[],
  keyOf: (item: T) => Key,
): readonly CaptureGroup<T, Key>[] {
  return items.reduce<readonly CaptureGroup<T, Key>[]>((groups, item) => {
    const key = keyOf(item);
    const index = groups.findIndex((group) => group.key === key);
    if (index === -1) return [...groups, { key, first: item, items: [item] }];
    return groups.map((group, at) => at === index
      ? { ...group, items: [...group.items, item] }
      : group);
  }, []);
}

function eventBase(capture: MilestoneCapture, startedAtMs: number): Omit<EventBase, 'key'> {
  return {
    viewId: capture.viewId,
    url: capture.url,
    atMs: capture.frame.receivedAtMs - startedAtMs,
  };
}

function pageEvent<F>(
  view: CaptureGroup<ClassifiedCapture, number>,
  startedAtMs: number,
  media: EventMedia<F, unknown>,
): PageJourneyEvent<F> {
  const loading = view.items.filter((item) => item.kind === 'loading');
  const preferred = loading.reduce<LoadingCapture | undefined>((selected, item) =>
    !selected || item.rank > selected.rank ? item : selected, undefined);
  return {
    ...eventBase(view.first.capture, startedAtMs),
    kind: 'page',
    key: `page:${view.key}`,
    entry: view.first.capture.entry,
    ...(preferred ? { frame: media.frame(preferred.capture) } : {}),
  };
}

function interactionKey(item: InteractionCapture): string {
  return `${item.interactionKind}:${item.capture.viewId}:${item.episode}`;
}

function interactionEvent<F, V>(
  group: CaptureGroup<InteractionCapture, string>,
  startedAtMs: number,
  clips: readonly Clip[],
  media: EventMedia<F, V>,
): InteractionJourneyEvent<F, V> {
  const before = group.items.filter((item) => item.endpoint === 'before').at(-1)?.capture;
  const after = group.items.filter((item) => item.endpoint === 'after').at(-1)?.capture;
  const { capture, interactionKind, postLabel } = group.first;
  const clip = clips.filter((item) => item.viewId === capture.viewId && item.label === postLabel).at(-1);
  return {
    ...eventBase(capture, startedAtMs),
    kind: interactionKind,
    key: group.key,
    atMs: (before ?? capture).frame.receivedAtMs - startedAtMs,
    ...(before ? { before: media.frame(before) } : {}),
    ...(after ? { after: media.frame(after) } : {}),
    ...(clip ? { clip: media.clip(clip) } : {}),
  };
}

function exitEvent<F>(exit: ExitCapture, startedAtMs: number, media: EventMedia<F, unknown>): ExitJourneyEvent<F> {
  return {
    ...eventBase(exit.capture, startedAtMs),
    kind: 'exit',
    key: `exit:${exit.capture.viewId}`,
    reason: exit.reason,
    frame: media.frame(exit.capture),
  };
}

function eventsForView<F, V>(
  view: CaptureGroup<ClassifiedCapture, number>,
  startedAtMs: number,
  clips: readonly Clip[],
  media: EventMedia<F, V>,
): readonly JourneyEvent<F, V>[] {
  const interactions = view.items.filter((item) => item.kind === 'interaction');
  const groups = groupInArrivalOrder(interactions, interactionKey);
  const exit = view.items.filter((item) => item.kind === 'exit').at(-1);
  return [
    pageEvent(view, startedAtMs, media),
    ...groups.map((group) => interactionEvent(group, startedAtMs, clips, media)),
    ...(exit ? [exitEvent(exit, startedAtMs, media)] : []),
  ];
}

/**
 * Classify captures, group them in arrival order, then project each view,
 * holding media as `media` says. Every step returns new readonly data; no
 * inputs or intermediate groups mutate. A late response remains in its
 * original view, ahead of that view's exit.
 */
export function projectEvents<F, V>(
  captures: readonly MilestoneCapture[],
  startedAtMs: number,
  clips: readonly Clip[],
  media: EventMedia<F, V>,
): readonly JourneyEvent<F, V>[] {
  const milestones = captures.flatMap((capture) => {
    const milestone = classifyCapture(capture);
    return milestone ? [milestone] : [];
  });
  const views = groupInArrivalOrder(milestones, (item) => item.capture.viewId);
  return views.flatMap((view) => eventsForView(view, startedAtMs, clips, media));
}

/** The events as the panel shows them, media inline. */
export function journeyEvents(
  captures: readonly MilestoneCapture[],
  startedAtMs: number,
  clips: readonly Clip[] = [],
): readonly JourneyEvent[] {
  return projectEvents(captures, startedAtMs, clips, inlineMedia);
}

/** A completed recording's events: its captures and clips, from its start. */
export function recordingEvents<F, V>(recording: StoredRecording, media: EventMedia<F, V>): readonly JourneyEvent<F, V>[] {
  const captures = recording.items.flatMap((item) => item.kind === 'capture' ? [item.capture] : []);
  const clips = recording.items.flatMap((item) => item.kind === 'clip' ? [item.clip] : []);
  return projectEvents(captures, recording.meta.startedAtMs, clips, media);
}

const mapped = <A, B>(value: A | undefined, map: (value: A) => B): B | undefined =>
  value === undefined ? undefined : map(value);

/** The same event with its media in another form, such as archive files turned into URLs. */
export function mapEventMedia<F, V, G, W>(
  event: JourneyEvent<F, V>,
  frame: (frame: F) => G,
  clip: (clip: V) => W,
): JourneyEvent<G, W> {
  switch (event.kind) {
    case 'page': return { ...event, frame: mapped(event.frame, frame) };
    case 'exit': return { ...event, frame: frame(event.frame) };
    case 'click':
    case 'scroll': return {
      ...event,
      before: mapped(event.before, frame),
      after: mapped(event.after, frame),
      clip: mapped(event.clip, clip),
    };
  }
}
