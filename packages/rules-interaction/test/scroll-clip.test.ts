import { describe, expect, it } from 'vitest';
import {
  QUIET_AFTER_MS,
  type ClipWrite,
  type CompositorFrame,
  type DomainEvent,
} from '@openuji/core';
import { RulesEngine } from '@openuji/engine';
import { ScrollEpisodeRule } from '@openuji/rules-interaction';
import { frame, milestone, navigated, quiet } from '../../engine/test/helpers.js';

/**
 * A scroll told frame by frame. Frames are named so the writes can be read:
 * `at(name, y, ms)` makes one and remembers its name.
 */
function script() {
  const names = new Map<CompositorFrame, string>();
  const at = (name: string, y: number, receivedAtMs: number): DomainEvent => {
    const f = frame({ scrollY: y, receivedAtMs });
    names.set(f, name);
    return { type: 'frame', frame: f };
  };

  /** Every clip write the scroll rule returned, as `frame f1`, `keep 04-…`, `drop`. */
  const writes = (events: readonly DomainEvent[]): ClipWrite[] => {
    const engine = new RulesEngine([ScrollEpisodeRule]);
    return events.flatMap((event) => [...engine.processEvent(event).clipWrites]);
  };
  const read = (all: readonly ClipWrite[]): string[] =>
    all.map((write) => {
      switch (write.type) {
        case 'frame':
          return `frame ${names.get(write.frame) ?? '?'}`;
        case 'keep':
          return `keep ${write.capture.label}`;
        case 'drop':
          return 'drop';
      }
    });

  return { at, writes, read };
}

describe('scroll clip writes', () => {
  it('writes the scroll from the frame at rest to the landing frame, then keeps it with its 04', () => {
    const { at, writes, read } = script();
    const all = writes([
      navigated('loader-a'),
      at('rest', 0, 0),
      quiet(QUIET_AFTER_MS),
      at('landed', 600, 300),
      quiet(550),
    ]);

    expect(read(all)).toEqual(['frame rest', 'frame landed', 'keep 04-post-scroll-01']);
  });

  it('names a clip after its start frame, the same on every write', () => {
    const { at, writes } = script();
    const rest = at('rest', 0, 0);
    const all = writes([navigated('loader-a'), rest, quiet(250), at('landed', 600, 300), quiet(550)]);

    const startIndex = rest.type === 'frame' ? rest.frame.index : NaN;
    expect(new Set(all.map((w) => w.id))).toEqual(new Set([`scroll-episode-${startIndex}`]));
  });

  /**
   * Measured on Chrome 154: a frame can show the scroll while still reporting
   * the old offset. Those frames are in the scroll, so they are in the clip.
   */
  it('includes the frames that reported no motion yet but came after the frame at rest', () => {
    const { at, writes, read } = script();
    const all = writes([
      navigated('loader-a'),
      at('rest', 0, 0),
      quiet(250),
      at('lagging-1', 0, 500),
      at('lagging-2', 0, 504),
      at('landed', 600, 520),
      quiet(770),
    ]);

    expect(read(all)).toEqual([
      'frame rest',
      'frame lagging-1',
      'frame lagging-2',
      'frame landed',
      'keep 04-post-scroll-01',
    ]);
  });

  it('writes the still frames of a pause once the page moves again, never the ones after the landing', () => {
    const { at, writes, read } = script();
    const all = writes([
      navigated('loader-a'),
      at('rest', 0, 0),
      quiet(250),
      at('moved', 300, 300),
      at('paused-1', 300, 316),
      at('paused-2', 300, 332),
      at('landed', 600, 400),
      at('after-1', 600, 416),
      at('after-2', 600, 432),
      quiet(682),
    ]);

    expect(read(all)).toEqual([
      'frame rest',
      'frame moved',
      'frame paused-1',
      'frame paused-2',
      'frame landed',
      'keep 04-post-scroll-01',
    ]);
  });

  it('writes each frame once, in order, as soon as it is known to belong', () => {
    const { at, writes } = script();
    const events = [
      navigated('loader-a'),
      at('rest', 0, 0),
      quiet(250),
      at('a', 100, 300),
      at('b', 100, 316),
      at('c', 200, 332),
      at('d', 300, 348),
      quiet(598),
    ];
    const frames = writes(events).flatMap((w) => (w.type === 'frame' ? [w.frame.index] : []));

    expect(frames).toEqual([...frames].sort((x, y) => x - y));
    expect(new Set(frames).size).toBe(frames.length);
  });

  describe('drops the clip of a scroll that is not recorded', () => {
    it('a jitter under 8 px', () => {
      const { at, writes, read } = script();
      const all = writes([
        navigated('loader-a'),
        at('rest', 0, 0),
        quiet(250),
        at('jitter', 3, 316),
        at('back', 0, 332),
        quiet(600),
      ]);

      expect(read(all)).toEqual(['frame rest', 'frame jitter', 'frame back', 'drop']);
    });

    it('a page change while the scroll is open', () => {
      const { at, writes, read } = script();
      const all = writes([
        navigated('loader-a'),
        at('rest', 0, 0),
        quiet(250),
        at('moving', 600, 300),
        navigated('loader-b'),
      ]);

      expect(read(all)).toEqual(['frame rest', 'frame moving', 'drop']);
    });

    it('the recording stopping', () => {
      const { at, writes, read } = script();
      const all = writes([
        navigated('loader-a'),
        at('rest', 0, 0),
        quiet(250),
        at('moving', 600, 300),
        { type: 'stop' },
      ]);

      expect(read(all)).toEqual(['frame rest', 'frame moving', 'drop']);
    });

    it("the page's firstPaint starting tracking over", () => {
      const { at, writes, read } = script();
      const all = writes([
        navigated('loader-b'),
        at('rest', 0, 0),
        quiet(250),
        at('moving', 500, 300),
        milestone('firstPaint', 'loader-b', 310),
      ]);

      expect(read(all)).toEqual(['frame rest', 'frame moving', 'drop']);
    });
  });

  it('keeps one scroll and opens the next in the same event, the landing starting the next clip', () => {
    const { at, writes } = script();
    const all = writes([
      navigated('loader-a'),
      at('rest', 0, 0),
      quiet(250),
      at('first', 300, 300),
      at('second', 700, 560), // the first landing is proven by now, and the page moves on
      quiet(810),
    ]);

    expect(all.map((w) => `${w.type} ${w.type === 'keep' ? w.capture.label : ''}`.trim())).toEqual([
      'frame',
      'frame',
      'keep 04-post-scroll-01',
      'frame',
      'frame',
      'keep 04-post-scroll-02',
    ]);
    const [first, second] = [...new Set(all.map((w) => w.id))];
    expect(all.slice(0, 3).every((w) => w.id === first)).toBe(true);
    expect(all.slice(3).every((w) => w.id === second)).toBe(true);
    // The next clip starts at the frame the first one landed on.
    const firstLanding = all[1];
    const secondStart = all[3];
    expect(firstLanding?.type === 'frame' && secondStart?.type === 'frame' && firstLanding.frame === secondStart.frame).toBe(true);
  });

  it('writes nothing for a page that does not scroll', () => {
    const { at, writes } = script();
    expect(writes([navigated('loader-a'), at('a', 0, 0), at('b', 0, 16), quiet(266), at('c', 0, 600)])).toEqual([]);
  });
});
