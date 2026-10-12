import type { Clip, CompositorFrame, MilestoneCapture, ViewEntry } from '@openuji/core';
import { DocumentLabel } from '@openuji/rules-document';
import { InteractionLabel } from '@openuji/rules-interaction';

type EventBase = Readonly<{
  key: string;
  viewId: number;
  url: string;
  /** Since the recording started, on the captured frame's arrival clock. */
  atMs: number;
}>;

export type PageJourneyEvent = EventBase & Readonly<{
  kind: 'page';
  entry: ViewEntry;
  frame?: CompositorFrame;
}>;

export type InteractionJourneyEvent = EventBase & Readonly<{
  kind: 'click' | 'scroll';
  before?: CompositorFrame;
  after?: CompositorFrame;
  clip?: Clip;
}>;

export type ExitJourneyEvent = EventBase & Readonly<{
  kind: 'exit';
  reason: 'navigation' | 'recording-ended';
  frame: CompositorFrame;
}>;

/** Derived panel data only: never persisted or sent over the recorder port. */
export type JourneyEvent = PageJourneyEvent | InteractionJourneyEvent | ExitJourneyEvent;

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

function pageEvent(
  view: CaptureGroup<ClassifiedCapture, number>,
  startedAtMs: number,
): PageJourneyEvent {
  const loading = view.items.filter((item) => item.kind === 'loading');
  const preferred = loading.reduce<LoadingCapture | undefined>((selected, item) =>
    !selected || item.rank > selected.rank ? item : selected, undefined);
  return {
    ...eventBase(view.first.capture, startedAtMs),
    kind: 'page',
    key: `page:${view.key}`,
    entry: view.first.capture.entry,
    ...(preferred ? { frame: preferred.capture.frame } : {}),
  };
}

function interactionKey(item: InteractionCapture): string {
  return `${item.interactionKind}:${item.capture.viewId}:${item.episode}`;
}

function interactionEvent(
  group: CaptureGroup<InteractionCapture, string>,
  startedAtMs: number,
  clips: readonly Clip[],
): InteractionJourneyEvent {
  const before = group.items.filter((item) => item.endpoint === 'before').at(-1)?.capture.frame;
  const after = group.items.filter((item) => item.endpoint === 'after').at(-1)?.capture.frame;
  const { capture, interactionKind, postLabel } = group.first;
  const clip = clips.filter((item) => item.viewId === capture.viewId && item.label === postLabel).at(-1);
  return {
    ...eventBase(capture, startedAtMs),
    kind: interactionKind,
    key: group.key,
    atMs: (before ?? capture.frame).receivedAtMs - startedAtMs,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(clip ? { clip } : {}),
  };
}

function exitEvent(exit: ExitCapture, startedAtMs: number): ExitJourneyEvent {
  return {
    ...eventBase(exit.capture, startedAtMs),
    kind: 'exit',
    key: `exit:${exit.capture.viewId}`,
    reason: exit.reason,
    frame: exit.capture.frame,
  };
}

function eventsForView(
  view: CaptureGroup<ClassifiedCapture, number>,
  startedAtMs: number,
  clips: readonly Clip[],
): readonly JourneyEvent[] {
  const interactions = view.items.filter((item) => item.kind === 'interaction');
  const groups = groupInArrivalOrder(interactions, interactionKey);
  const exit = view.items.filter((item) => item.kind === 'exit').at(-1);
  return [
    pageEvent(view, startedAtMs),
    ...groups.map((group) => interactionEvent(group, startedAtMs, clips)),
    ...(exit ? [exitEvent(exit, startedAtMs)] : []),
  ];
}

/**
 * Classify captures, group them in arrival order, then project each view.
 * Every step returns new readonly data; no inputs or intermediate groups mutate.
 * A late response remains in its original view, ahead of that view's exit.
 */
export function journeyEvents(
  captures: readonly MilestoneCapture[],
  startedAtMs: number,
  clips: readonly Clip[] = [],
): readonly JourneyEvent[] {
  const milestones = captures.flatMap((capture) => {
    const milestone = classifyCapture(capture);
    return milestone ? [milestone] : [];
  });
  const views = groupInArrivalOrder(milestones, (item) => item.capture.viewId);
  return views.flatMap((view) => eventsForView(view, startedAtMs, clips));
}
