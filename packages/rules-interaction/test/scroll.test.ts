import { describe, expect, it } from 'vitest';
import { QUIET_AFTER_MS, type CompositorFrame, type DomainEvent, type MilestoneCapture } from '@openuji/core';
import { RulesEngine, type MilestoneRule } from '@openuji/engine';
import { defaultInteractionRules, ScrollEpisodeRule } from '@openuji/rules-interaction';
import {
  click,
  frame,
  navigated,
  pageAt,
  moved,
  pageScroll,
  quiet,
  scrollCause,
  withinDocument,
} from '../../engine/test/helpers.js';

/**
 * Scripts a page: named frames, so each capture says which picture it took.
 * A frame's own offset is left at a stale value on purpose: the rule must
 * never read it.
 */
function script() {
  const names = new Map<CompositorFrame, string>();
  const shown = (name: string, receivedAtMs: number, staleOffset = 0): DomainEvent => {
    const f = frame({ scrollY: staleOffset, receivedAtMs });
    names.set(f, name);
    return { type: 'frame', frame: f };
  };
  const run = (events: readonly DomainEvent[], rules: readonly MilestoneRule[] = [ScrollEpisodeRule]) => {
    const engine = new RulesEngine(rules);
    return events.flatMap((event) => [...engine.processEvent(event).captures]);
  };
  /** Each capture as `label picture`. */
  const read = (captures: readonly MilestoneCapture[]): string[] =>
    captures.map((c) => `${c.label} ${names.get(c.frame) ?? '?'}`);
  return { shown, run, read };
}

describe('ScrollEpisodeRule', () => {
  it("ends once the page said scrollend and reported nothing for 250 ms: 03 is the frame before its first report, 04 the newest after its last", () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(100, 300),
      shown('moving', 316),
      ...moved(200, 332),
      pageScroll(200, 340, { ended: true }),
      shown('landed', 360),
      quiet(340 + QUIET_AFTER_MS),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
    expect(captures[1]?.scrollEpisode?.path.map((s) => s.y)).toEqual([100, 200, 200]);
    expect(captures.map((c) => c.detail)).toEqual([
      'Pre-scroll #1 of the page at (0, 0)',
      'Post-scroll #1 of the page: (0, 0) → (0, 200), travelled 200px, by wheel',
    ]);
    // Each record's position is the page's own: where it was, where it landed.
    expect(captures.map((c) => c.position)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 200 }]);
  });

  /**
   * Measured on www.fu-berlin.de (Chrome 154): the offset stamped on frames
   * stayed at 54 for 460 ms while 27 different pictures arrived and the page
   * reported 72 … 312. Frame offsets split that gesture in three; the page's
   * reports keep it one.
   */
  it('keeps one gesture one scroll while the frames’ offsets stall, taking positions from the page', () => {
    const { shown, run, read } = script();
    const events: DomainEvent[] = [navigated('loader-a'), pageAt(0, 0), shown('rest', 10, 0)];
    for (let i = 0; i < 20; i++) {
      const at = 300 + i * 25;
      events.push(...moved(18 * (i + 1), at), shown(`f${i}`, at + 10, 54));
    }
    events.push(pageScroll(360, 800, { ended: true }), shown('landed', 820, 54), quiet(1_050));

    const captures = run(events);
    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
    expect(captures[1]?.scrollEpisode?.path.at(-1)?.y).toBe(360);
  });

  it('keeps a spin of wheel notches one scroll: each says scrollend, the next moves again within 250 ms', () => {
    const { shown, run, read } = script();
    const events: DomainEvent[] = [navigated('loader-a'), pageAt(0, 0), shown('rest', 10)];
    for (let i = 0; i < 4; i++) {
      const at = 300 + i * 100;
      events.push(...moved(100 * (i + 1), at), pageScroll(100 * (i + 1), at, { ended: true }), shown(`notch-${i}`, at + 20));
    }
    events.push(quiet(600 + QUIET_AFTER_MS));

    expect(read(run(events))).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 notch-3']);
  });

  it('records an instant jump from where the page said it was', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(800, 300),
      pageScroll(800, 300, { ended: true }),
      shown('jumped', 330),
      quiet(550),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 jumped']);
    expect(captures[1]?.detail).toContain('travelled 800px');
  });

  it('tells two gestures apart by the 250 ms after the first one’s scrollend', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(200, 300),
      pageScroll(200, 310, { ended: true }),
      shown('first-landed', 330),
      shown('still', 600),
      ...moved(400, 700),
      pageScroll(400, 710, { ended: true }),
      shown('second-landed', 730),
      quiet(960),
    ]);

    expect(read(captures)).toEqual([
      '03-pre-scroll-01 rest',
      // Its own landing, not the frame on screen when its end was noticed.
      '04-post-scroll-01 first-landed',
      '03-pre-scroll-02 still',
      '04-post-scroll-02 second-landed',
    ]);
  });

  it('keeps a pause with the finger down one scroll: no scrollend, so not over', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(100, 300),
      shown('moving', 310),
      // 600 ms without a report and without scrollend: the finger rests.
      shown('resting', 700),
      ...moved(300, 910),
      pageScroll(300, 920, { ended: true }),
      shown('landed', 940),
      quiet(1_170),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
  });

  it('ends a scroll whose scrollend never comes, after 1 s of silence', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(300, 300),
      shown('landed', 320),
      quiet(550), // not yet: no scrollend
      quiet(1_300),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
  });

  it('takes as 04 the newest frame within 100 ms of the last report, whenever the end is noticed', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(500, 300),
      pageScroll(500, 310, { ended: true }),
      shown('arriving', 320),
      shown('landed', 350),
      shown('image-loaded', 480), // after the landing: not the 04
      quiet(730),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
  });

  it('waits for a frame newer than the last report: the picture of where the page landed', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(500, 300),
      pageScroll(500, 300, { ended: true }),
      quiet(550), // 250 ms on, but nothing painted since the report
      shown('painted-late', 900),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 painted-late']);
  });

  /** Measured in headless-shell (Chrome 154): the picture came 6–8 ms before the page's report about it. */
  it('starts from the page at rest when a picture comes ahead of the report, and lands on it if nothing paints after', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      shown('jumped', 294),
      ...moved(600, 300),
      pageScroll(600, 300, { ended: true }),
      quiet(550),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 jumped']);
  });

  it('counts a horizontal scroll', () => {
    const { shown, run, read } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(0, 300, { x: 500 }),
      pageScroll(0, 300, { x: 500, ended: true }),
      shown('landed', 320),
      quiet(550),
    ]);

    expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
    expect(captures[1]?.detail).toBe('Post-scroll #1 of the page: (0, 0) → (500, 0), travelled 500px, by wheel');
  });

  it('keeps a scroll down and back up, though it ends where it started', () => {
    const { shown, run } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(400, 300),
      ...moved(0, 320),
      pageScroll(0, 330, { ended: true }),
      shown('back', 340),
      quiet(580),
    ]);

    expect(captures[1]?.detail).toContain('travelled 800px');
  });

  it('drops a jitter that travels less than 8 px', () => {
    const { shown, run } = script();
    expect(
      run([
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        ...moved(3, 300),
        pageScroll(3, 310, { ended: true }),
        shown('jitter', 320),
        quiet(560),
      ]),
    ).toEqual([]);
  });

  it('says only what it knows: no position before the scroll if the page never said one', () => {
    const { shown, run } = script();
    const captures = run([
      navigated('loader-a'),
      shown('rest', 10),
      ...moved(100, 300),
      ...moved(300, 320),
      pageScroll(300, 330, { ended: true }),
      shown('landed', 340),
      quiet(580),
    ]);

    expect(captures.map((c) => c.detail)).toEqual([
      'Pre-scroll #1 of the page',
      'Post-scroll #1 of the page: to (0, 300), travelled 200px, by wheel',
    ]);
    expect(captures[0]?.position).toBeUndefined();
  });

  it('keeps a click out of the scroll: a quick click comes first, the scroll still shows where it landed', () => {
    const { shown, run, read } = script();
    const captures = run(
      [
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        ...moved(600, 300),
        pageScroll(600, 300, { ended: true }),
        shown('landed', 320),
        click('button#menu', 400),
        shown('menu-open', 420),
        quiet(670),
      ],
      defaultInteractionRules,
    );

    expect(read(captures)).toEqual([
      '10-pre-click-01 landed',
      '11-post-click-01 menu-open',
      '03-pre-scroll-01 rest',
      // Where the scroll landed; the click's response came after it.
      '04-post-scroll-01 landed',
    ]);
  });

  it('does not record a scroll still open when the page changes, or when the recording stops', () => {
    const { shown, run } = script();
    const open = [navigated('loader-a'), pageAt(0, 0), shown('rest', 10), ...moved(600, 300), shown('moving', 320)];

    expect(run([...open, navigated('loader-b')])).toEqual([]);
    expect(run([...open, { type: 'stop' }])).toEqual([]);
  });

  it('records a scroll that ended before the page changes', () => {
    const { shown, run } = script();
    const captures = run([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(600, 300),
      pageScroll(600, 300, { ended: true }),
      shown('landed', 320),
      quiet(550),
      navigated('loader-b'),
    ]);

    expect(captures.map((c) => `${c.viewId} ${c.label}`)).toEqual(['1 03-pre-scroll-01', '1 04-post-scroll-01']);
  });

  it('takes the first 250 ms of a view for the page arriving: a new page restoring its scroll is no scroll', () => {
    const { shown, run } = script();
    expect(
      run([
        navigated('loader-a'),
        pageAt(0, 0),
        ...moved(900, 50), // restored before anything of this page was painted
        pageScroll(900, 50, { ended: true }),
        shown('restored', 80),
        quiet(330),
      ]),
    ).toEqual([]);
  });

  it("takes reports in a view's first 250 ms for the page arriving, even after a late frame of the previous route", () => {
    const { shown, run } = script();
    const captures = run([
      navigated('loader-a', 'https://app.example/'),
      pageAt(0, 0),
      shown('home', 10),
      quiet(260),
      withinDocument('https://app.example/inbox'),
      shown('home-late', 600, 2000), // the previous route's last picture, delivered late
      ...moved(0, 620), // the router puts the new route at the top
      pageScroll(0, 620, { ended: true }),
      shown('inbox', 640),
      quiet(890),
    ]);

    expect(captures).toEqual([]);
  });

  it("does not take a router's scroll reset for a scroll of the new route, and numbers each view from 01", () => {
    const { shown, run } = script();
    const captures = run([
      navigated('loader-a', 'https://app.example/'),
      pageAt(0, 0),
      shown('home', 10),
      ...moved(2000, 300),
      pageScroll(2000, 300, { ended: true }),
      shown('home-down', 320),
      quiet(550),
      withinDocument('https://app.example/inbox'),
      // The router resets the scroll before the new route paints.
      ...moved(0, 700),
      pageScroll(0, 700, { ended: true }),
      shown('inbox', 720),
      quiet(970),
      ...moved(500, 1_000),
      pageScroll(500, 1_000, { ended: true }),
      shown('inbox-down', 1_020),
      quiet(1_250),
    ]);

    expect(captures.map((c) => `${c.viewId} ${c.label}`)).toEqual([
      '1 03-pre-scroll-01',
      '1 04-post-scroll-01',
      '2 03-pre-scroll-01',
      '2 04-post-scroll-01',
    ]);
    // The second view's scroll starts where the router left the page.
    expect(captures[3]?.detail).toBe('Post-scroll #1 of the page: (0, 0) → (0, 500), travelled 500px, by wheel');
  });

  describe('a scroll needs a cause', () => {
    /**
     * Measured on fu-berlin.de (Chrome 154): resizing the window while scrolled
     * down sent 32 position reports, no cause and no scrollend. Chrome kept the
     * content in place; nothing scrolled.
     */
    it('takes moves without a cause for the page re-laid out: no scroll, the position updates', () => {
      const { shown, run } = script();
      const engine = new RulesEngine([ScrollEpisodeRule]);
      const events: DomainEvent[] = [navigated('loader-a'), pageAt(1_400, 0), shown('rest', 10)];
      for (let i = 0; i < 32; i++) events.push(pageScroll(1_400 + i, 300 + i * 8));
      events.push(shown('resized', 560), quiet(1_800));

      expect(run(events)).toEqual([]);
      for (const event of events) engine.processEvent(event);
      expect(engine.currentState.currentView?.position).toEqual({ x: 0, y: 1_431 });
    });

    it('takes a cause older than 250 ms for nothing', () => {
      const { shown, run } = script();
      expect(
        run([
          navigated('loader-a'),
          pageAt(0, 0),
          shown('rest', 10),
          scrollCause('key', 300, 'PageDown'), // at the end of the page: nothing moved
          pageScroll(40, 700), // later, the layout shifts
          pageScroll(40, 700, { ended: true }),
          shown('shifted', 720),
          quiet(1_000),
        ]),
      ).toEqual([]);
    });

    it('opens nothing for a layout drift after a scroll ended', () => {
      const { shown, run, read } = script();
      const captures = run([
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        ...moved(600, 300),
        pageScroll(600, 300, { ended: true }),
        shown('landed', 320),
        quiet(550),
        pageScroll(620, 900), // images loading above: no cause
        shown('drifted', 920),
        quiet(2_000),
      ]);

      expect(read(captures)).toEqual(['03-pre-scroll-01 rest', '04-post-scroll-01 landed']);
    });

    it('says what started it: the person, how, or the page', () => {
      const { shown, run } = script();
      const captures = run([
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        scrollCause('script', 300, 'scrollIntoView'),
        pageScroll(800, 302),
        pageScroll(800, 302, { ended: true }),
        shown('there', 320),
        quiet(560),
        scrollCause('key', 900, 'PageDown'),
        pageScroll(1_500, 910),
        pageScroll(1_500, 950, { ended: true }),
        shown('further', 970),
        quiet(1_200),
      ]);

      const posts = captures.filter((c) => c.scrollEpisode);
      expect(posts.map((c) => c.scrollEpisode?.cause)).toEqual([
        { kind: 'script', detail: 'scrollIntoView' },
        { kind: 'key', detail: 'PageDown' },
      ]);
      expect(posts.map((c) => c.detail)).toEqual([
        "Post-scroll #1 of the page: (0, 0) → (0, 800), travelled 800px, by the page's scrollIntoView",
        'Post-scroll #2 of the page: (0, 800) → (0, 1500), travelled 700px, by the PageDown key',
      ]);
    });
  });
});
