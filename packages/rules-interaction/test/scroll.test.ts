import { describe, expect, it } from 'vitest';
import { QUIET_AFTER_MS, type DomainEvent, type MilestoneCapture } from '@openuji/core';
import { RulesEngine, type MilestoneRule } from '@openuji/engine';
import { defaultInteractionRules, ScrollEpisodeRule } from '@openuji/rules-interaction';
import {
  click,
  frame,
  frameEvent,
  milestone,
  navigated,
  quiet,
  withinDocument,
} from '../../engine/test/helpers.js';

function run(
  events: readonly DomainEvent[],
  rules: readonly MilestoneRule[] = [ScrollEpisodeRule],
): MilestoneCapture[] {
  const engine = new RulesEngine(rules);
  return events.flatMap((event) => [...engine.processEvent(event).captures]);
}

/** Label and the offset of the frame each capture shows. */
function scrolls(captures: readonly MilestoneCapture[]): string[] {
  return captures.map((c) => `${c.label} ${c.frame.scrollX},${c.frame.scrollY}`);
}

/** The page painted at `y`, then nothing for long enough to prove it at rest. */
function resting(y: number, atMs: number): DomainEvent[] {
  return [frameEvent({ scrollY: y, receivedAtMs: atMs }), quiet(atMs + QUIET_AFTER_MS)];
}

/** A page that keeps painting at `y`: a frame every 16 ms over `[fromMs, toMs]`. */
function ticking(y: number, fromMs: number, toMs: number): DomainEvent[] {
  const frames: DomainEvent[] = [];
  for (let at = fromMs; at <= toMs; at += 16) {
    frames.push(frameEvent({ scrollY: y, receivedAtMs: at }));
  }
  return frames;
}

describe('ScrollEpisodeRule', () => {
  it('ends a scroll on a page that stops painting on quiet, with the frames from either side', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 600, receivedAtMs: 300 }), // an instant scroll: one frame
      quiet(550), // Chrome sends nothing more
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,600']);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([0, 600]);
    expect(captures[1]?.detail).toBe(
      'Post-scroll #1 of the page: (0, 0) → (0, 600), travelled 600px',
    );
  });

  /**
   * Measured on Chrome 154 (still page, CDP wheel): a frame's image can be
   * newer than the offset it reports. f002 and f003 already showed the page
   * scrolled while reporting 0, so the frame before the offset moved (f003)
   * is no "before". The page last proven at rest (f001) is.
   */
  it('takes its before from the page proven at rest, not the frames whose images may already have moved', () => {
    // Numbered in arrival order, as the compositor source numbers them.
    const f001 = frame({ scrollY: 0, receivedAtMs: 0 });
    const f002 = frame({ scrollY: 0, receivedAtMs: 500 }); // shows 600, reports 0
    const f003 = frame({ scrollY: 0, receivedAtMs: 504 }); // shows 600, reports 0
    const f004 = frame({ scrollY: 600, receivedAtMs: 520 });
    const captures = run([
      navigated('loader-a'),
      { type: 'frame', frame: f001 },
      quiet(250),
      { type: 'frame', frame: f002 },
      { type: 'frame', frame: f003 },
      { type: 'frame', frame: f004 },
      quiet(770),
    ]);

    expect(captures.map((c) => c.label)).toEqual(['03-pre-scroll-01', '04-post-scroll-01']);
    expect(captures[0]?.frame).toBe(f001);
    expect(captures[1]?.frame).toBe(f004);
  });

  it('on a page that keeps painting, takes the latest frame 250 ms old as its before, and ends at the landing frame', () => {
    const captures = run([
      navigated('loader-a'),
      ...ticking(0, 0, 400),
      frameEvent({ scrollY: 100, receivedAtMs: 416 }),
      frameEvent({ scrollY: 200, receivedAtMs: 432 }),
      frameEvent({ scrollY: 300, receivedAtMs: 448 }),
      ...ticking(300, 464, 800),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,300']);
    // At 416 the frames up to 166 ms are proven at rest; the latest came at 160.
    expect(captures[0]?.frame.receivedAtMs).toBe(160);
    // The landing frame, not a later still one.
    expect(captures[1]?.frame.receivedAtMs).toBe(448);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([0, 100, 200, 300]);
  });

  it('decides nothing while the page keeps painting less than 250 ms after the last motion', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 600, receivedAtMs: 300 }),
      ...ticking(600, 316, 549),
    ]);

    expect(captures).toEqual([]);
  });

  it("takes movement in a page's first 250 ms for the page arriving, not a scroll: never a 04 without its 03", () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 600, receivedAtMs: 50 }),
      quiet(300),
    ]);

    expect(captures).toEqual([]);
  });

  it('tells two scrolls apart by the pause between them, even with no frame in it', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 300, receivedAtMs: 300 }),
      // Nothing painted for a second, then the next scroll.
      frameEvent({ scrollY: 700, receivedAtMs: 1_300 }),
      quiet(1_550),
    ]);

    expect(scrolls(captures)).toEqual([
      '03-pre-scroll-01 0,0',
      '04-post-scroll-01 0,300',
      '03-pre-scroll-02 0,300',
      '04-post-scroll-02 0,700',
    ]);
    // Where the first landed, proven at rest, is where the second set off.
    expect(captures[1]?.frame).toBe(captures[2]?.frame);
  });

  it('keeps a pause shorter than 250 ms inside one scroll', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 300, receivedAtMs: 300 }),
      frameEvent({ scrollY: 600, receivedAtMs: 500 }),
      quiet(750),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,600']);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([0, 300, 600]);
  });

  it('keeps a scroll down and back up, though it ends where it started', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 400, receivedAtMs: 316 }),
      frameEvent({ scrollY: 0, receivedAtMs: 332 }),
      quiet(600),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,0']);
    expect(captures[1]?.detail).toContain('travelled 800px');
  });

  it('drops a jitter that travels less than 8 px', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 3, receivedAtMs: 316 }),
      frameEvent({ scrollY: 0, receivedAtMs: 332 }),
      quiet(600),
    ]);

    expect(captures).toEqual([]);
  });

  it('adds up a slow drift, measured from where the page rests rather than the previous frame', () => {
    const drift = (): DomainEvent[] =>
      Array.from({ length: 30 }, (_, i) =>
        frameEvent({ scrollY: (i + 1) * 0.5, receivedAtMs: 300 + 16 * (i + 1) }),
      );
    const captures = run([navigated('loader-a'), ...resting(0, 0), ...drift(), quiet(1_100)]);

    expect(captures.map((c) => c.label)).toEqual(['03-pre-scroll-01', '04-post-scroll-01']);
    expect(captures[1]?.frame.scrollY).toBe(15);
  });

  it('counts a horizontal scroll', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollX: 0, receivedAtMs: 0 }),
      quiet(QUIET_AFTER_MS),
      frameEvent({ scrollX: 500, receivedAtMs: 300 }),
      quiet(550),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 500,0']);
  });

  it('keeps a click out of the scroll: a quick click comes first, the scroll still shows where it landed', () => {
    const captures = run(
      [
        navigated('loader-a'),
        ...resting(0, 0),
        frameEvent({ scrollY: 600, receivedAtMs: 300 }),
        click('button#menu', 400), // 100 ms after landing
        frameEvent({ scrollY: 600, receivedAtMs: 420 }), // the click's response
        quiet(670),
      ],
      defaultInteractionRules,
    );

    expect(captures.map((c) => `${c.label} ${c.frame.receivedAtMs}`)).toEqual([
      '10-pre-click-01 300',
      '11-post-click-01 420',
      '03-pre-scroll-01 0',
      '04-post-scroll-01 300',
    ]);
  });

  it('lets a late click end the scroll by its time alone, so the scroll comes first', () => {
    const captures = run(
      [
        navigated('loader-a'),
        ...resting(0, 0),
        frameEvent({ scrollY: 600, receivedAtMs: 300 }),
        click('button#menu', 600),
        frameEvent({ scrollY: 600, receivedAtMs: 620 }),
      ],
      defaultInteractionRules,
    );

    expect(captures.map((c) => c.label)).toEqual([
      '03-pre-scroll-01',
      '04-post-scroll-01',
      '10-pre-click-01',
      '11-post-click-01',
    ]);
  });

  it('records a scroll that settled before the page changes', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 600, receivedAtMs: 300 }),
      quiet(550),
      navigated('loader-b'),
    ]);

    expect(captures.map((c) => `${c.viewId} ${c.label}`)).toEqual([
      '1 03-pre-scroll-01',
      '1 04-post-scroll-01',
    ]);
  });

  it("does not record a scroll still open when the page changes: its last frame may be the next page's", () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 600, receivedAtMs: 300 }),
      navigated('loader-b'),
    ]);

    expect(captures).toEqual([]);
  });

  it('does not record a scroll still open when the recording stops', () => {
    const captures = run([
      navigated('loader-a'),
      ...resting(0, 0),
      frameEvent({ scrollY: 600, receivedAtMs: 300 }),
      { type: 'stop' },
    ]);

    expect(captures).toEqual([]);
  });

  describe('a page change, where a frame can land on the wrong side of it', () => {
    it("A, page load: the previous page's late frame in the next page is no scroll", () => {
      const captures = run([
        navigated('loader-a'),
        ...resting(600, 0),
        navigated('loader-b'),
        frameEvent({ scrollY: 600, receivedAtMs: 300 }), // page A, delivered late
        frameEvent({ scrollY: 0, receivedAtMs: 312 }), // page B's first frame
        milestone('firstPaint', 'loader-b', 315),
        quiet(565),
      ]);

      expect(captures).toEqual([]);
    });

    it('A, slow page load: the late frame had time to look still, firstPaint starts over', () => {
      const captures = run([
        navigated('loader-a'),
        ...resting(600, 0),
        navigated('loader-b'),
        frameEvent({ scrollY: 600, receivedAtMs: 300 }), // page A, delivered late
        quiet(550), // long enough for it to count as still
        frameEvent({ scrollY: 0, receivedAtMs: 1_800 }), // page B, 1.5 s later
        milestone('firstPaint', 'loader-b', 1_803),
        quiet(2_053),
      ]);

      expect(captures).toEqual([]);
    });

    it("A, slow page load with firstPaint before the next page's frame: still no scroll", () => {
      const captures = run([
        navigated('loader-a'),
        ...resting(600, 0),
        navigated('loader-b'),
        frameEvent({ scrollY: 600, receivedAtMs: 300 }), // page A, delivered late
        quiet(550),
        milestone('firstPaint', 'loader-b', 1_797),
        frameEvent({ scrollY: 0, receivedAtMs: 1_800 }), // page B
        quiet(2_050),
      ]);

      expect(captures).toEqual([]);
    });

    it('a real scroll right after the next page has drawn is recorded', () => {
      const captures = run([
        navigated('loader-b'),
        frameEvent({ scrollY: 0, receivedAtMs: 0 }),
        milestone('firstPaint', 'loader-b', 3),
        quiet(253),
        frameEvent({ scrollY: 500, receivedAtMs: 300 }),
        quiet(550),
      ]);

      expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,500']);
    });

    it("A, SPA route: the previous route's late frame in the new route is no scroll", () => {
      const captures = run([
        navigated('loader-a', 'https://app.example/'),
        ...resting(2000, 0),
        withinDocument('https://app.example/inbox'),
        frameEvent({ scrollY: 2000, receivedAtMs: 300 }), // the old route, delivered late
        frameEvent({ scrollY: 0, receivedAtMs: 310 }), // the new route, scroll reset
        quiet(560),
      ]);

      expect(captures).toEqual([]);
    });

    it("B, SPA route: the new route's frame before the route message is no scroll of the old route", () => {
      const captures = run([
        navigated('loader-a', 'https://app.example/'),
        ...resting(2000, 0),
        frameEvent({ scrollY: 0, receivedAtMs: 300 }), // rendered before pushState
        withinDocument('https://app.example/inbox'),
        frameEvent({ scrollY: 0, receivedAtMs: 320 }),
        quiet(570),
      ]);

      expect(captures).toEqual([]);
    });
  });

  it('does not take a route change for a scroll, and numbers each view from 01', () => {
    const captures = run([
      navigated('loader-a', 'https://app.example/'),
      ...resting(0, 0),
      frameEvent({ scrollY: 2000, receivedAtMs: 300 }),
      quiet(600),
      withinDocument('https://app.example/inbox'),
      // The router's scroll reset, painted together with the new route.
      ...resting(0, 700),
      frameEvent({ scrollY: 500, receivedAtMs: 1_000 }),
      quiet(1_250),
    ]);

    expect(captures.map((c) => `${c.viewId} ${c.label} ${c.frame.scrollY}`)).toEqual([
      '1 03-pre-scroll-01 0',
      '1 04-post-scroll-01 2000',
      '2 03-pre-scroll-01 0',
      '2 04-post-scroll-01 500',
    ]);
  });

  it('needs a frame of the view to measure from', () => {
    expect(run([navigated('loader-a'), quiet(300)])).toEqual([]);
    expect(run([navigated('loader-a'), frameEvent({ scrollY: 600 }), quiet(300)])).toEqual([]);
  });
});
