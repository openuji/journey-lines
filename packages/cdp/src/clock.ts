import type { Cancel, Clock } from './transport.js';

/**
 * The system's clock: `Date.now`, with timers that wait until `Date.now` agrees.
 *
 * `setTimeout` measures on a clock of its own and can fire a millisecond before
 * `Date.now` has moved that far; a timer that wakes early waits out the rest,
 * so whatever it stamps is never earlier than the time it was set for.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
  at(atMs, fire): Cancel {
    let timer: ReturnType<typeof setTimeout>;
    const wake = (): void => {
      const left = atMs - Date.now();
      if (left > 0) timer = setTimeout(wake, left);
      else fire(atMs);
    };
    timer = setTimeout(wake, Math.max(0, atMs - Date.now()));
    return () => clearTimeout(timer);
  },
};
