/**
 * The probe's payloads, as domain events. Nothing is taken on trust: the
 * binding the probe calls is a global function in the page, so the page's
 * own scripts can call it too. A payload becomes an event only if it is
 * exactly what `core/wire.ts` says; that makes it well-formed, not authentic.
 */

import {
  PRESS_KINDS,
  SCROLL_CAUSES,
  TARGET_TEXT_FIELDS,
  type InteractionAction,
  type InteractionEvent,
  type PagePositionEvent,
  type PageScrollEvent,
  type PressEndedEvent,
  type PressEvent,
  type PressKind,
  type ProbeWirePayload,
  type ScrollCause,
  type ScrollCauseEvent,
  type TargetElementMeta,
} from '@openuji/core';

/**
 * What the probe source emits: what the person did to an element, the press
 * it came from or that ended without one, and the page scrolling itself.
 */
export type ProbeEvent =
  | InteractionEvent
  | PressEvent
  | PressEndedEvent
  | PageScrollEvent
  | PagePositionEvent
  | ScrollCauseEvent;

type Fields = Readonly<Record<string, unknown>>;
/** When a payload reached the host, and the page's own time in it. */
type Arrival = Readonly<{ receivedAtMs: number; pageTimeMs: number }>;
/**
 * `navigationStartMs`: when the reporting document's time origin is on
 * Chrome's monotonic clock, ms; absent when the host doesn't know it.
 */
type Decode = (payload: Fields, at: Arrival, navigationStartMs?: number) => ProbeEvent | null;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null;

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean';

const isCause = (value: unknown): value is ScrollCause =>
  isText(value) && (SCROLL_CAUSES as readonly string[]).includes(value);

const isPressKind = (value: unknown): value is PressKind =>
  isText(value) && (PRESS_KINDS as readonly string[]).includes(value);

/** An optional field: absent, or of its kind. */
const optional =
  <T>(is: (value: unknown) => value is T) =>
  (value: unknown): value is T | undefined =>
    value === undefined || is(value);

/**
 * When the DOM event happened on Chrome's clock: its document's time origin
 * plus its own `timeStamp`. Nothing when either is unknown.
 */
const happenedAt = (
  eventTimeMs: number | undefined,
  navigationStartMs: number | undefined,
): { happenedAtMs?: number } =>
  eventTimeMs !== undefined && navigationStartMs !== undefined
    ? { happenedAtMs: navigationStartMs + eventTimeMs }
    : {};

function isTarget(value: unknown): value is TargetElementMeta {
  if (!isObject(value) || !isObject(value.boundingRect)) return false;
  const { tagName, selector, clientX, clientY, boundingRect: rect } = value;
  return (
    isText(tagName) &&
    isText(selector) &&
    isNumber(clientX) &&
    isNumber(clientY) &&
    [rect.x, rect.y, rect.width, rect.height].every(isNumber) &&
    TARGET_TEXT_FIELDS.every((key) => value[key] === undefined || isText(value[key]))
  );
}

const positionOf = ({ x, y }: Fields): Readonly<{ x: number; y: number }> | null =>
  isNumber(x) && isNumber(y) ? { x, y } : null;

const interaction =
  (action: InteractionAction): Decode =>
  ({ target, eventTimeMs, pressId, trusted }, at, navigationStartMs) =>
    isTarget(target) &&
    optional(isNumber)(eventTimeMs) &&
    optional(isText)(pressId) &&
    optional(isFlag)(trusted)
      ? {
          type: 'interaction',
          action,
          target,
          ...at,
          ...happenedAt(eventTimeMs, navigationStartMs),
          ...(pressId !== undefined ? { pressId } : {}),
          ...(trusted !== undefined ? { trusted } : {}),
        }
      : null;

const pageScroll =
  (ended: boolean): Decode =>
  (payload, at) => {
    const position = positionOf(payload);
    return position ? { type: 'page-scroll', ended, ...position, ...at } : null;
  };

/** One decoder per wire action: a new action without one does not compile. */
const DECODE: Readonly<Record<ProbeWirePayload['action'], Decode>> = {
  click: interaction('click'),
  input: interaction('input'),
  change: interaction('change'),
  position: (payload, at) => {
    const position = positionOf(payload);
    return position ? { type: 'page-position', ...position, ...at } : null;
  },
  scroll: pageScroll(false),
  scrollend: pageScroll(true),
  press: ({ kind, detail, pressId, eventTimeMs }, at, navigationStartMs) =>
    isPressKind(kind) && optional(isText)(detail) && isText(pressId) && isNumber(eventTimeMs)
      ? {
          type: 'press',
          kind,
          ...(detail ? { detail } : {}),
          pressId,
          ...at,
          ...happenedAt(eventTimeMs, navigationStartMs),
        }
      : null,
  'press-ended': ({ pressId }, at) => (isText(pressId) ? { type: 'press-ended', pressId, ...at } : null),
  'scroll-cause': ({ kind, detail }, at) =>
    isCause(kind) && (detail === undefined || isText(detail))
      ? { type: 'scroll-cause', kind, ...(detail ? { detail } : {}), ...at }
      : null,
};

const isAction = (value: unknown): value is ProbeWirePayload['action'] =>
  isText(value) && Object.hasOwn(DECODE, value);

function parseObject(json: string): Fields | null {
  try {
    const value: unknown = JSON.parse(json);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * One JSON payload the probe sent, as a domain event; `null` unless it is
 * exactly what the wire contract says. Independent of how it travelled, so any
 * delivery channel can reuse it.
 *
 * `receivedAtMs` is when the payload reached the host (see the clocks note in
 * `@openuji/core`); the probe's own `pageTimeMs` is carried through as is.
 * `navigationStartMs`, when the host knows the reporting document's time
 * origin on Chrome's clock, gives a press or click its `happenedAtMs`.
 */
export function decodeProbePayload(
  json: string,
  receivedAtMs: number,
  navigationStartMs?: number,
): ProbeEvent | null {
  const payload = parseObject(json);
  if (!payload || !isAction(payload.action) || !isNumber(payload.pageTimeMs)) return null;
  return DECODE[payload.action](payload, { receivedAtMs, pageTimeMs: payload.pageTimeMs }, navigationStartMs);
}
