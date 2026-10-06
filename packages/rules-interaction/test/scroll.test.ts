import { describe, expect, it } from 'vitest';
import type { DomainEvent, MilestoneCapture } from '@openuji/core';
import { RulesEngine, type MilestoneRule } from '@openuji/engine';
import { defaultInteractionRules, ScrollEpisodeRule } from '@openuji/rules-interaction';
import {
  click,
  frameEvent,
  navigated,
  quiet,
  withinDocument,
} from '../../engine/test/helpers.js';

function run(
  events: readonly DomainEvent[],
  rules: readonly MilestoneRule[] = [ScrollEpisodeRule],
): MilestoneCapture[] {
  const engine = new RulesEngine(rules);
  return events.flatMap((event) => [...engine.processEvent(event)]);
}

/** Label and the offset of the frame each capture shows. */
function scrolls(captures: readonly MilestoneCapture[]): string[] {
  return captures.map((c) => `${c.label} ${c.frame.scrollX},${c.frame.scrollY}`);
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
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 600, receivedAtMs: 50 }), // an instant scroll: one frame
      quiet(300), // Chrome sends nothing more
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,600']);
    expect(captures[1]?.scrollEpisode?.settled).toBe(true);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([0, 600]);
    expect(captures[1]?.detail).toBe(
      'Post-scroll #1 of the page: (0, 0) → (0, 600), travelled 600px',
    );
  });

  it('decides nothing while the page keeps painting less than 250 ms after the last motion', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0 }),
      frameEvent({ scrollY: 600, receivedAtMs: 50 }),
      ...ticking(600, 66, 299),
    ]);

    expect(captures).toEqual([]);
  });


  it('on a page that keeps painting, ends once its frames have shown no motion for 250 ms, at the landing frame', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 100, receivedAtMs: 16 }),
      frameEvent({ scrollY: 200, receivedAtMs: 32 }),
      frameEvent({ scrollY: 300, receivedAtMs: 48 }),
      ...ticking(300, 64, 400),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,300']);
    // The landing frame, not a later still one.
    expect(captures[1]?.frame.receivedAtMs).toBe(48);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([0, 100, 200, 300]);
  });

  it('tells two scrolls apart by the pause between them, even with no frame in it', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 300, receivedAtMs: 50 }),
      // Nothing painted for a second, then the next scroll.
      frameEvent({ scrollY: 700, receivedAtMs: 1_050 }),
      quiet(1_300),
    ]);

    expect(scrolls(captures)).toEqual([
      '03-pre-scroll-01 0,0',
      '04-post-scroll-01 0,300',
      '03-pre-scroll-02 0,300',
      '04-post-scroll-02 0,700',
    ]);
    // Where the first landed is where the second set off.
    expect(captures[1]?.frame).toBe(captures[2]?.frame);
  });

  it('keeps a pause shorter than 250 ms inside one scroll', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 300, receivedAtMs: 50 }),
      frameEvent({ scrollY: 600, receivedAtMs: 250 }),
      quiet(500),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,600']);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([0, 300, 600]);
  });

  it('keeps a scroll down and back up, though it ends where it started', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 400, receivedAtMs: 16 }),
      frameEvent({ scrollY: 0, receivedAtMs: 32 }),
      quiet(300),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,0']);
    expect(captures[1]?.detail).toContain('travelled 800px');
  });

  it('drops a jitter that travels less than 8 px', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      frameEvent({ scrollY: 3, receivedAtMs: 16 }),
      frameEvent({ scrollY: 0, receivedAtMs: 32 }),
      quiet(300),
    ]);

    expect(captures).toEqual([]);
  });

  it('adds up a slow drift, measured from where the page rests rather than the previous frame', () => {
    const drift = Array.from({ length: 30 }, (_, i) =>
      frameEvent({ scrollY: (i + 1) * 0.5, receivedAtMs: 16 * (i + 1) }),
    );
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0, receivedAtMs: 0 }),
      ...drift,
      quiet(800),
    ]);

    expect(captures.map((c) => c.label)).toEqual(['03-pre-scroll-01', '04-post-scroll-01']);
    expect(captures[1]?.frame.scrollY).toBe(15);
  });

  it('counts a horizontal scroll', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollX: 0, receivedAtMs: 0 }),
      frameEvent({ scrollX: 500, receivedAtMs: 50 }),
      quiet(300),
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 500,0']);
  });

  it('keeps a click out of the scroll: a quick click comes first, the scroll still shows where it landed', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent({ scrollY: 0, receivedAtMs: 0 }),
        frameEvent({ scrollY: 600, receivedAtMs: 50 }),
        click('button#menu', 150), // 100 ms after landing
        frameEvent({ scrollY: 600, receivedAtMs: 170 }), // the click's response
        quiet(420),
      ],
      defaultInteractionRules,
    );

    expect(captures.map((c) => `${c.label} ${c.frame.receivedAtMs}`)).toEqual([
      '10-pre-click-01 50',
      '11-post-click-01 170',
      '03-pre-scroll-01 0',
      '04-post-scroll-01 50',
    ]);
  });

  it('lets a late click end the scroll by its time alone, so the scroll comes first', () => {
    const captures = run(
      [
        navigated('loader-a'),
        frameEvent({ scrollY: 0, receivedAtMs: 0 }),
        frameEvent({ scrollY: 600, receivedAtMs: 50 }),
        click('button#menu', 400),
        frameEvent({ scrollY: 600, receivedAtMs: 420 }),
      ],
      defaultInteractionRules,
    );

    expect(captures.map((c) => c.label)).toEqual([
      '03-pre-scroll-01',
      '04-post-scroll-01',
      '10-pre-click-01',
      '11-post-click-01',
    ]);
    expect(captures[1]?.scrollEpisode?.settled).toBe(true);
  });

  it('flushes a scroll still open when the view ends, unsettled, under the view it happened in', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0 }),
      frameEvent({ scrollY: 600 }),
      navigated('loader-b'),
    ]);

    expect(captures.map((c) => `${c.viewId} ${c.label}`)).toEqual([
      '1 03-pre-scroll-01',
      '1 04-post-scroll-01',
    ]);
    expect(captures[1]?.scrollEpisode?.settled).toBe(false);
    expect(captures[1]?.detail).toContain('cut short by the view ending');
  });

  it('flushes a scroll still open at the end of the session, unsettled', () => {
    const captures = run([
      navigated('loader-a'),
      frameEvent({ scrollY: 0 }),
      frameEvent({ scrollY: 600 }),
      { type: 'stop' },
    ]);

    expect(scrolls(captures)).toEqual(['03-pre-scroll-01 0,0', '04-post-scroll-01 0,600']);
    expect(captures[1]?.scrollEpisode?.settled).toBe(false);
  });

  it('does not take a route change for a scroll, and numbers each view from 01', () => {
    const captures = run([
      navigated('loader-a', 'https://app.example/'),
      frameEvent({ scrollY: 0 }),
      frameEvent({ scrollY: 2000 }),
      quiet(1_000),
      withinDocument('https://app.example/inbox'),
      // The router's scroll reset, painted together with the new route.
      frameEvent({ scrollY: 0, receivedAtMs: 1_100 }),
      frameEvent({ scrollY: 500, receivedAtMs: 1_200 }),
      quiet(1_500),
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
