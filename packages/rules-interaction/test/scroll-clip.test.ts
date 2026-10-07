import { describe, expect, it } from 'vitest';
import {
  QUIET_AFTER_MS,
  type ClipWrite,
  type CompositorFrame,
  type DomainEvent,
} from '@openuji/core';
import { RulesEngine } from '@openuji/engine';
import { ScrollEpisodeRule } from '@openuji/rules-interaction';
import { frame, moved, navigated, pageAt, pageScroll, quiet } from '../../engine/test/helpers.js';

/** A scroll told event by event, with named frames so the writes can be read. */
function script() {
  const names = new Map<CompositorFrame, string>();
  const shown = (name: string, receivedAtMs: number): DomainEvent => {
    // A stale offset on every frame: positions must come from the page.
    const f = frame({ scrollY: 54, receivedAtMs });
    names.set(f, name);
    return { type: 'frame', frame: f };
  };

  const writes = (events: readonly DomainEvent[]): ClipWrite[] => {
    const engine = new RulesEngine([ScrollEpisodeRule]);
    return events.flatMap((event) => [...engine.processEvent(event).clipWrites]);
  };

  /** `frame <name> @<y>`, `keep <label>`, `drop`. */
  const read = (all: readonly ClipWrite[]): string[] =>
    all.map((write) => {
      switch (write.type) {
        case 'frame':
          return `frame ${names.get(write.frame) ?? '?'} @${write.position?.y ?? '?'}`;
        case 'keep':
          return `keep ${write.capture.label}`;
        case 'drop':
          return 'drop';
      }
    });

  return { shown, writes, read };
}

describe('scroll clip writes', () => {
  it('writes the scroll from its 03 through its 04, once each and in order, with where the page said it was', () => {
    const { shown, writes, read } = script();
    const all = writes([
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

    expect(read(all)).toEqual([
      'frame rest @0',
      'frame moving @100',
      'frame landed @200',
      'keep 04-post-scroll-01',
    ]);
  });

  it('names a clip after its start frame, the same on every write', () => {
    const { shown, writes } = script();
    const rest = shown('rest', 10);
    const all = writes([
      navigated('loader-a'),
      pageAt(0, 0),
      rest,
      ...moved(600, 300),
      pageScroll(600, 300, { ended: true }),
      shown('landed', 320),
      quiet(550),
    ]);

    const startIndex = rest.type === 'frame' ? rest.frame.index : NaN;
    expect(new Set(all.map((w) => w.id))).toEqual(new Set([`scroll-episode-${startIndex}`]));
  });

  it('puts a picture that came ahead of the report in the clip, after its 03', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      shown('jumped', 294),
      ...moved(600, 300),
      pageScroll(600, 300, { ended: true }),
      quiet(550),
    ]);

    expect(read(all)).toEqual(['frame rest @0', 'frame jumped @0', 'keep 04-post-scroll-01']);
  });

  it('leaves out what paints after the landing', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(500, 300),
      pageScroll(500, 300, { ended: true }),
      shown('landed', 330),
      shown('image-loaded', 480),
      quiet(730),
    ]);

    expect(read(all)).toEqual(['frame rest @0', 'frame landed @500', 'keep 04-post-scroll-01']);
  });

  it('takes the frames of a pause into the clip once the page moves again', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('loader-a'),
      pageAt(0, 0),
      shown('rest', 10),
      ...moved(100, 300),
      shown('paused-1', 320),
      shown('paused-2', 500),
      shown('paused-3', 650),
      ...moved(300, 700),
      pageScroll(300, 710, { ended: true }),
      shown('landed', 730),
      quiet(960),
    ]);

    expect(read(all)).toEqual([
      'frame rest @0',
      'frame paused-1 @100',
      'frame paused-2 @100',
      'frame paused-3 @100',
      'frame landed @300',
      'keep 04-post-scroll-01',
    ]);
  });

  describe('drops the clip of a scroll that is not recorded', () => {
    it('a jitter under 8 px', () => {
      const { shown, writes, read } = script();
      const all = writes([
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        ...moved(3, 300),
        pageScroll(3, 300, { ended: true }),
        shown('jitter', 320),
        quiet(550),
      ]);

      expect(read(all)).toEqual(['frame rest @0', 'frame jitter @3', 'drop']);
    });

    it('a page change while the scroll is open', () => {
      const { shown, writes, read } = script();
      const all = writes([
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        ...moved(600, 300),
        shown('moving', 316),
        navigated('loader-b'),
      ]);

      expect(read(all)).toEqual(['frame rest @0', 'frame moving @600', 'drop']);
    });

    it('the recording stopping', () => {
      const { shown, writes, read } = script();
      const all = writes([
        navigated('loader-a'),
        pageAt(0, 0),
        shown('rest', 10),
        ...moved(600, 300),
        { type: 'stop' },
      ]);

      expect(read(all)).toEqual(['frame rest @0', 'drop']);
    });
  });

  it('writes nothing for a page that does not scroll', () => {
    const { shown, writes } = script();
    expect(writes([navigated('loader-a'), pageAt(0, 0), shown('a', 10), shown('b', 26), quiet(276)])).toEqual([]);
  });
});
