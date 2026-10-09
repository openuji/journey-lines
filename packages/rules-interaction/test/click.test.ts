import { describe, expect, it } from 'vitest';
import { QUIET_AFTER_MS, type CompositorFrame, type DomainEvent, type MilestoneCapture } from '@openuji/core';
import { RulesEngine, type MilestoneRule } from '@openuji/engine';
import { CLICK_DEFAULTS, ClickEpisodeRule } from '@openuji/rules-interaction';
import {
  click,
  frame,
  navigated,
  press,
  pressAndClick,
  pressEnded,
  quiet,
  withinDocument,
} from '../../engine/test/helpers.js';

/**
 * Named frames: `shown('month', 113, 112)` is a frame that arrived at 113 and
 * was drawn at 112 on Chrome's clock (omit the draw time: Chrome before 156).
 */
function script() {
  const names = new Map<CompositorFrame, string>();
  const shown = (name: string, receivedAtMs: number, drawnAtMs?: number): DomainEvent => {
    const f = frame({ receivedAtMs, ...(drawnAtMs !== undefined ? { drawnAtMs } : {}) });
    names.set(f, name);
    return { type: 'frame', frame: f };
  };
  const run = (events: readonly DomainEvent[], rules: readonly MilestoneRule[] = [ClickEpisodeRule]) => {
    const engine = new RulesEngine(rules);
    return events.flatMap((event) => [...engine.processEvent(event).captures]);
  };
  /** `"<label> <frame name>"` for each capture. */
  const read = (captures: readonly MilestoneCapture[]): string[] =>
    captures.map((c) => `${c.label} ${names.get(c.frame) ?? '?'}`);
  return { shown, run, read };
}

describe('ClickEpisodeRule', () => {
  it('takes 10 from before the press, even when the page responded before the click arrived', () => {
    // flatpickr: the month turns on pointerdown; the click comes on release.
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('october', 10, 10),
      shown('november', 104, 112), // drawn after the press, arrives before its report
      ...pressAndClick('p1', { at: 105, drawnAt: 100, clickAt: 170 }),
      // The click comes on release, 65 ms after the page had already responded.
      quiet(170 + QUIET_AFTER_MS),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 october', '11-post-click-01 november']);
    expect(captures[1]?.detail).toContain('came to rest');
  });

  it('takes a frame drawn before the press that arrives after its report', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('old', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('before', 120, 95), // drawn before the press, late
      shown('after', 125, 110),
      click('button#go', 170, { pressId: 'p1', trusted: true }),
      pressEnded('p1', 170),
      quiet(420),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 after']);
  });

  it('splits a quick series at each press, with a separate 10 and 11', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      ...pressAndClick('p2', { at: 301, drawnAt: 300, clickAt: 370 }, [shown('dec', 313, 312)]),
      ...pressAndClick('p3', { at: 501, drawnAt: 500, clickAt: 570 }, [shown('jan', 513, 512)]),
      quiet(570 + QUIET_AFTER_MS),
    ]);

    expect(read(captures)).toEqual([
      '10-pre-click-01 oct',
      '11-post-click-01 nov',
      '10-pre-click-02 nov',
      '11-post-click-02 dec',
      '10-pre-click-03 dec',
      '11-post-click-03 jan',
    ]);
    expect(captures[1]?.detail).toContain('before the next interaction');
  });

  it('gives clicks apart in time a response each', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      quiet(420),
      ...pressAndClick('p2', { at: 1001, drawnAt: 1000, clickAt: 1070 }, [shown('dec', 1013, 1012)]),
      quiet(1320),
    ]);

    expect(read(captures)).toEqual([
      '10-pre-click-01 oct',
      '11-post-click-01 nov',
      '10-pre-click-02 nov',
      '11-post-click-02 dec',
    ]);
    expect(captures[1]?.detail).not.toContain('shared');
  });

  it("takes a click the page's own code made as its own cause", () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('before', 0, 0),
      click('button#go', 201, { happenedAtMs: 200, trusted: false }),
      shown('after', 213, 212),
      quiet(463),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 after']);
    expect(captures[0]?.detail).toContain("clicked by the page's own code");
  });

  it('gives a click the browser made with no press reported no 10, and says so', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('before', 0, 0),
      click('button#go', 201, { happenedAtMs: 200, trusted: true }),
      shown('after', 213, 212),
      quiet(463),
    ]);

    expect(read(captures)).toEqual(['11-post-click-01 after']);
    expect(captures[0]?.detail).toContain('no press was reported');
  });

  it('records a press and release without any click, using the target at press time', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('rest', 0, 0),
      press('drag', 101, { happenedAtMs: 100, selector: 'div#vanish' }),
      shown('changed', 150, 140),
      pressEnded('drag', 200),
      quiet(450),
    ]);
    expect(read(captures)).toEqual(['10-pre-click-01 rest', '11-post-click-01 changed']);
    expect(captures.map((c) => c.domTarget?.selector)).toEqual(['div#vanish', 'div#vanish']);
  });

  it('does not create another interaction for a native click after its press segment closed', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('before', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('after', 113, 112),
      pressEnded('p1', 170),
      quiet(420),
      click('button#go', 500, { pressId: 'p1', trusted: true }),
      quiet(750),
    ]);
    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 after']);
  });

  it('keeps a script click independent from a held physical press', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('X', 0, 0),
      press('p1', 101, { happenedAtMs: 100, selector: 'button#physical' }),
      shown('Y', 113, 112),
      // Even an incorrectly supplied pressId cannot make a script click claim it.
      click('button#script', 150, { pressId: 'p1', trusted: false, happenedAtMs: 149 }),
      shown('Z', 160, 159),
      click('button#physical', 170, { pressId: 'p1', trusted: true }),
      pressEnded('p1', 171),
      quiet(421),
    ]);
    expect(read(captures)).toEqual([
      '10-pre-click-01 X', '11-post-click-01 Y',
      '10-pre-click-02 Y', '11-post-click-02 Z',
    ]);
    expect(captures.map((c) => c.domTarget?.selector)).toEqual([
      'button#physical', 'button#physical', 'button#script', 'button#script',
    ]);
  });

  it('places by arrival where Chrome gives no draw time, and says so', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('before', 0),
      press('p1', 101),
      shown('after', 113),
      click('button#go', 170, { pressId: 'p1', trusted: true }),
      pressEnded('p1', 170),
      quiet(420),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 after']);
    expect(captures[0]?.detail).toContain('placed by arrival');
    expect(captures[1]?.detail).toContain('placed by arrival');
  });

  it('says when nothing changed on screen', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('still', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }),
      quiet(420),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 still', '11-post-click-01 still']);
    expect(captures[1]?.detail).toContain('nothing changed on screen');
  });

  /**
   * Regression: pre- and post-click used to be two rules with two counters and
   * different increment conditions. A click before the first compositor frame
   * incremented only the post counter, so every later pair was mismatched.
   */
  it('keeps pre/post episode numbers paired after a click with no prior frame', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      ...pressAndClick('p1', { at: 1, drawnAt: 0, clickAt: 60, selector: 'a#early' }),
      shown('first', 80, 79),
      quiet(330),
      ...pressAndClick('p2', { at: 501, drawnAt: 500, clickAt: 560, selector: 'a#later' }, [
        shown('second', 513, 512),
      ]),
      quiet(810),
    ]);

    expect(read(captures)).toEqual([
      '11-post-click-01 first',
      '10-pre-click-02 first',
      '11-post-click-02 second',
    ]);
    expect(captures.slice(1).map((c) => c.domTarget?.selector)).toEqual(['a#later', 'a#later']);
  });

  it('ends a response whose screen never stops changing, and says so', () => {
    const { shown, run, read } = script();
    const ticks = Array.from({ length: 30 }, (_, i) => shown(`tick-${i}`, 200 + i * 100, 199 + i * 100));
    const captures = run([
      navigated('a'),
      shown('before', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }),
      ...ticks,
    ]);

    // Over at the first event `stillMovingMs` after the click; its picture is the screen then.
    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 tick-19']);
    expect(captures[1]?.detail).toContain(`Screen ${CLICK_DEFAULTS.stillMovingMs / 1000} s after the press; observation limit reached`);
  });

  it('records the last observed screen when Stop ends a moving response', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('before', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }),
      shown('moving', 180, 179),
      { type: 'stop' },
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 moving']);
    expect(captures[1]?.detail).toContain('Last observed screen when recording stopped');
  });

  it.each([
    { reportAt: 200, released: true },
    { reportAt: 420, released: true }, // quiet would otherwise win
    { reportAt: 2_500, released: false }, // limit would otherwise win
  ])('records the old tab endpoint when its exit arrives at $reportAt ms, released=$released', ({ reportAt, released }) => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('before', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('moving', 120, 119),
      ...(released ? [pressEnded('p1', 170)] : []),
      { type: 'session-changed', otherTab: true, receivedAtMs: 180 },
      navigated('other-tab', undefined, reportAt),
      shown('other', reportAt + 10, reportAt + 9),
      quiet(reportAt + 260),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 moving']);
    expect(captures[1]?.detail).toContain('Last observed screen before leaving the tab');
    expect(captures.every((capture) => capture.viewId === 1)).toBe(true);
  });

  it('files a click that changes the route under the view it was clicked in', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a', 'https://app.example/'),
      shown('home', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170, selector: 'a#inbox' }),
      // An SPA link: the route changes before anything is painted.
      withinDocument('https://app.example/inbox', 'a'),
      shown('inbox', 190, 189),
      quiet(440),
      ...pressAndClick('p2', { at: 601, drawnAt: 600, clickAt: 670, selector: 'button#compose' }),
      shown('compose', 690, 689),
      quiet(940),
    ]);

    expect(read(captures)).toEqual([
      '10-pre-click-01 home',
      '11-post-click-01 inbox',
      '10-pre-click-01 inbox',
      '11-post-click-01 compose',
    ]);
    expect(captures.map((c) => `${c.viewId} ${c.url}`)).toEqual([
      '1 https://app.example/',
      '1 https://app.example/',
      '2 https://app.example/inbox',
      '2 https://app.example/inbox',
    ]);
    expect(captures[1]?.detail).toContain('now showing https://app.example/inbox');
  });

  it('files a 10 with the URL showing when it was clicked', () => {
    const { shown, run } = script();
    const captures = run([
      navigated('a', 'https://app.example/list'),
      shown('list', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }),
      // A filter: a query-only change, same view, later URL.
      withinDocument('https://app.example/list?q=x', 'a'),
      shown('filtered', 190, 189),
      quiet(440),
    ]);

    expect(captures.map((c) => `${c.label} ${c.url}`)).toEqual([
      '10-pre-click-01 https://app.example/list',
      '11-post-click-01 https://app.example/list?q=x',
    ]);
  });

  it('decides rest before a late frame counts: a change after the screen rested is not the response', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('pressed', 113, 112)]),
      // A slow response: nothing for 600 ms, then the calendar changes.
      shown('nov', 700, 699),
      quiet(950),
    ]);

    expect(read(captures)).toEqual(['10-pre-click-01 oct', '11-post-click-01 pressed']);
  });

  it('ends a response before a press that holds on past the rest, and gives that press its own pair', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      press('p2', 301, { happenedAtMs: 300 }), // held down for 400 ms
      shown('dec', 313, 312),
      quiet(563), // rests while p2 is still held
      click('button#go', 701, { pressId: 'p2', trusted: true }),
      pressEnded('p2', 701),
      quiet(951),
    ]);

    expect(read(captures)).toEqual([
      '10-pre-click-01 oct',
      '11-post-click-01 nov', // not dec: that is p2's doing
      '10-pre-click-02 nov',
      '11-post-click-02 dec',
    ]);
  });

  it('restarts numbering in every view', () => {
    const { shown, run } = script();
    const captures = run([
      navigated('a'),
      shown('a', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }),
      quiet(420),
      navigated('b'),
      shown('b', 500, 499),
      ...pressAndClick('p2', { at: 601, drawnAt: 600, clickAt: 670 }),
      quiet(920),
    ]);

    expect(captures.map((c) => `${c.viewId} ${c.label}`)).toEqual([
      '1 10-pre-click-01',
      '1 11-post-click-01',
      '2 10-pre-click-01',
      '2 11-post-click-01',
    ]);
  });
});
