/**
 * Clicks, and the presses they come from.
 *
 * A page can respond to a click before the `click` event: a date picker turns
 * the month on `pointerdown`, 60–80 ms earlier (flatpickr, measured). So the
 * press is reported as soon as it happens, and the click names the press it
 * came from. That pairing is made here, in the page, where the order of the
 * DOM events is exact; the host only matches names.
 *
 * Every report carries its DOM event's own `timeStamp`: the host puts it on
 * Chrome's clock, where frames say when they were drawn.
 */

import type {
  InteractionWirePayload,
  PressEndedWirePayload,
  PressKind,
  PressWirePayload,
  TargetElementMeta,
} from '@openuji/core/wire';
import { on } from './on.js';

type Report = (payload: InteractionWirePayload | PressWirePayload | PressEndedWirePayload) => void;

/** A press going on: its name, and what ends it — `pointer` coming up, or its own key (`Enter`, `Space`). */
type Pending = Readonly<{ id: string; endedBy: string }>;

/** Keys that make a click on what has focus: Enter on a link or button, Space on a button. */
const ACTIVATING: Readonly<Record<string, string>> = { Enter: 'Enter', ' ': 'Space' };

/** Starts observing. Returns how to stop. Run in every frame: a click counts wherever it is. */
export function observeClicks(
  report: Report,
  describe: (event: MouseEvent | KeyboardEvent) => TargetElementMeta | null,
): () => void {
  // Names this document's presses: a token drawn once here, and a count. A
  // press of another document or frame can never have the same name.
  const token = Math.random().toString(36).slice(2, 10);
  let count = 0;
  /** The press a click now would come from. */
  let pending: Pending | undefined;
  /** The press whose release is being seen out: it ends once. */
  let ending: string | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const press = (event: MouseEvent | KeyboardEvent, kind: PressKind, detail: string): void => {
    const target = describe(event);
    if (!target) return;
    const pressId = `${token}-${++count}`;
    pending = { id: pressId, endedBy: kind === 'pointer' ? 'pointer' : detail };
    report({
      action: 'press',
      kind,
      detail,
      target,
      pressId,
      eventTimeMs: event.timeStamp,
      pageTimeMs: Date.now(),
    });
  };

  // The browser dispatches a press's click in the task that releases it
  // (`pointerup`, or the key's own events). Once that task is over the press
  // names nothing. Release ends the physical gesture, even for a drag or an
  // element removed on pointerdown; a click is never needed to confirm it.
  const released = (endedBy: string): void => {
    const was = pending;
    if (was?.endedBy !== endedBy || ending === was.id) return;
    ending = was.id;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (pending === was) pending = undefined;
      report({ action: 'press-ended', pressId: was.id, pageTimeMs: Date.now() });
    }, 0);
    timers.add(timer);
  };
  const keyOf = (event: KeyboardEvent): string => ACTIVATING[event.key] ?? event.key;

  return stopAll([
    on('pointerdown', (event) => {
      if (event.isTrusted && event.isPrimary && event.button === 0) press(event, 'pointer', event.pointerType);
    }),
    on('keydown', (event) => {
      const key = ACTIVATING[event.key];
      if (event.isTrusted && key && !event.repeat) press(event, 'key', key);
    }),
    on('pointerup', () => released('pointer')),
    on('pointercancel', () => released('pointer')),
    on('keyup', (event) => released(keyOf(event))),
    on('click', (event) => {
      const target = describe(event);
      if (!target) return;
      const source = event.isTrusted ? pending : undefined;
      report({
        action: 'click',
        target,
        pageTimeMs: Date.now(),
        eventTimeMs: event.timeStamp,
        ...(source ? { pressId: source.id } : {}),
        trusted: event.isTrusted,
      });
    }),
    () => { for (const timer of timers) clearTimeout(timer); },
  ]);
}

function stopAll(stops: readonly (() => void)[]): () => void {
  return () => {
    for (const stop of stops) stop();
  };
}
