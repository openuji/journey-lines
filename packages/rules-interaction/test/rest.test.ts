import { describe, expect, it } from 'vitest';
import { QUIET_AFTER_MS } from '@openuji/core';
import { elapse, hold, isProven, NOTHING_PROVEN, restart } from '@openuji/rules-interaction';
import { frame } from '../../engine/test/helpers.js';

describe('Rest', () => {
  it('proves a frame only once QUIET_AFTER_MS has passed after it, and keeps the latest proven', () => {
    const a = frame({ receivedAtMs: 0 });
    const b = frame({ receivedAtMs: 100 });
    const c = frame({ receivedAtMs: 200 });
    const rest = [a, b, c].reduce((held, f) => hold(held, f), NOTHING_PROVEN);

    expect(elapse(rest, QUIET_AFTER_MS - 1)).toBe(rest);
    expect(elapse(rest, 100 + QUIET_AFTER_MS)).toEqual({
      proven: b,
      pending: [{ frame: c, sinceMs: 200 }],
    });
    expect(elapse(rest, 10_000)).toEqual({ proven: c, pending: [] });
  });

  it('starts the proof over at motion, keeping what was already proven', () => {
    const still = frame({ receivedAtMs: 0 });
    const proven = elapse(hold(NOTHING_PROVEN, still), QUIET_AFTER_MS);
    const waiting = hold(proven, frame({ receivedAtMs: 300 }));
    const moving = frame({ receivedAtMs: 320 });

    expect(restart(waiting, moving)).toEqual({
      proven: still,
      pending: [{ frame: moving, sinceMs: 320 }],
    });
  });

  it('counts stillness from when it is told to, not from arrival', () => {
    const late = frame({ receivedAtMs: 0 });
    const rest = hold(NOTHING_PROVEN, late, 1_000);

    expect(elapse(rest, 1_000 + QUIET_AFTER_MS - 1).proven).toBeNull();
    expect(elapse(rest, 1_000 + QUIET_AFTER_MS).proven).toBe(late);
  });

  it('tells by frame index whether a frame, or a later one, is proven', () => {
    const earlier = frame({ receivedAtMs: 0 });
    const later = frame({ receivedAtMs: 0 }); // stamped alike
    const rest = elapse(hold(NOTHING_PROVEN, earlier), QUIET_AFTER_MS);

    expect(isProven(rest, earlier)).toBe(true);
    expect(isProven(rest, later)).toBe(false);
    expect(isProven(NOTHING_PROVEN, earlier)).toBe(false);
  });
});
