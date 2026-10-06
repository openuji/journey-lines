import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { systemClock } from '../src/clock.js';
import { createManualClock } from '../src/testing.js';

describe('systemClock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never fires before Date.now reads the time it was set for, and stamps that time', () => {
    const fire = vi.fn();
    systemClock.at(1_100, fire);

    // The timer wakes, but Date.now still reads a millisecond short.
    vi.setSystemTime(999);
    vi.advanceTimersByTime(100);
    expect(fire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledWith(1_100);
  });

  it('fires nothing once cancelled', () => {
    const fire = vi.fn();
    const cancel = systemClock.at(1_100, fire);
    cancel();
    vi.advanceTimersByTime(1_000);
    expect(fire).not.toHaveBeenCalled();
  });
});

describe('createManualClock', () => {
  it('fires due timers in deadline order as it advances, each at its own time', () => {
    const clock = createManualClock(0);
    const fired: string[] = [];
    clock.at(300, (at) => fired.push(`b ${at} ${clock.now()}`));
    clock.at(100, (at) => fired.push(`a ${at} ${clock.now()}`));
    clock.at(900, () => fired.push('late'));

    clock.advance(500);

    expect(fired).toEqual(['a 100 100', 'b 300 300']);
    expect(clock.now()).toBe(500);
  });
});
