import { describe, expect, it } from 'vitest';
import { QUIET_AFTER_MS, type ClipWrite, type CompositorFrame, type DomainEvent } from '@openuji/core';
import { RulesEngine } from '@openuji/engine';
import { ClickEpisodeRule } from '@openuji/rules-interaction';
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

/** Clicks told event by event, with named frames so each clip's writes can be read. */
function script() {
  const names = new Map<CompositorFrame, string>();
  /** A frame that arrived at `receivedAtMs`, drawn at `drawnAtMs` on Chrome's clock. */
  const shown = (name: string, receivedAtMs: number, drawnAtMs: number, index?: number): DomainEvent => {
    const f = frame({ receivedAtMs, drawnAtMs, ...(index !== undefined ? { index } : {}) });
    names.set(f, name);
    return { type: 'frame', frame: f };
  };

  const writes = (events: readonly DomainEvent[]): ClipWrite[] => {
    const engine = new RulesEngine([ClickEpisodeRule]);
    return events.flatMap((event) => [...engine.processEvent(event).clipWrites]);
  };

  /** `<clip>: frame <name>`, `<clip>: keep <label>`, `<clip>: drop`; the clip by its id after the rule's. */
  const read = (all: readonly ClipWrite[]): string[] =>
    all.map((write) => {
      const clip = write.id.replace('click-episode-', '');
      switch (write.type) {
        case 'frame':
          return `${clip}: frame ${names.get(write.frame) ?? '?'}`;
        case 'keep':
          return `${clip}: keep ${write.capture.label}`;
        case 'drop':
          return `${clip}: drop`;
      }
    });

  return { shown, writes, read };
}

describe('click clip writes', () => {
  it("writes a click's clip from its 10 to its 11, kept with its 11", () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      quiet(170 + QUIET_AFTER_MS),
    ]);

    expect(read(all)).toEqual(['p1: frame oct', 'p1: frame nov', 'p1: keep 11-post-click-01']);
  });

  it('starts with a response the page drew before its press was reported (flatpickr)', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('october', 10, 10),
      shown('november', 104, 112), // drawn after the press, arrives before its report
      ...pressAndClick('p1', { at: 105, drawnAt: 100, clickAt: 170 }),
      quiet(420),
    ]);

    expect(read(all)).toEqual(['p1: frame october', 'p1: frame november', 'p1: keep 11-post-click-01']);
  });

  it('starts on its 10 even when that frame arrived after the press was reported', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('old', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('before', 120, 95), // drawn before the press, late: it is the 10
      shown('after', 125, 110),
      click('button#go', 170, { pressId: 'p1', trusted: true }),
      quiet(420),
    ]);

    expect(read(all)).toEqual(['p1: frame before', 'p1: frame after', 'p1: keep 11-post-click-01']);
  });

  it('gives each of quick clicks its own clip, from its own 10 to the shared 11', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      ...pressAndClick('p2', { at: 301, drawnAt: 300, clickAt: 370 }, [shown('dec', 313, 312)]),
      ...pressAndClick('p3', { at: 501, drawnAt: 500, clickAt: 570 }, [shown('jan', 513, 512)]),
      quiet(570 + QUIET_AFTER_MS),
    ]);

    expect(read(all)).toEqual([
      'p1: frame oct',
      'p1: frame nov',
      'p1: frame dec',
      'p2: frame nov',
      'p2: frame dec',
      'p1: frame jan',
      'p2: frame jan',
      'p3: frame dec',
      'p3: frame jan',
      'p1: keep 11-post-click-01',
      'p2: keep 11-post-click-02',
      'p3: keep 11-post-click-03',
    ]);
  });

  it('makes no clip where nothing changed on screen', () => {
    const { shown, writes } = script();
    const all = writes([
      navigated('a'),
      shown('still', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }),
      quiet(420),
    ]);

    expect(all).toEqual([]);
  });

  it('drops the clip of a press that ended without a click', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('rest', 0, 0),
      press('drag', 101, { happenedAtMs: 100 }),
      shown('dragged', 150, 140),
      pressEnded('drag', 200),
      shown('later', 300, 299),
    ]);

    expect(read(all)).toEqual(['drag: frame rest', 'drag: frame dragged', 'drag: drop']);
  });

  it('drops what is going when the recording stops, a press still down too', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('before', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('moving', 113, 112)]),
      press('p2', 201, { happenedAtMs: 200 }),
      shown('still moving', 213, 212),
      { type: 'stop' },
    ]);

    expect(read(all)).toEqual([
      'p1: frame before',
      'p1: frame moving',
      'p1: frame still moving',
      'p2: frame moving',
      'p2: frame still moving',
      'p1: drop',
      'p2: drop',
    ]);
  });

  it('drops what is going when the recording moves to another tab, and writes nothing there', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('before', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('moving', 113, 112)]),
      { type: 'session-changed', otherTab: true, receivedAtMs: 180 },
      navigated('other-tab'),
      shown('other', 190, 189),
      quiet(440),
    ]);

    expect(read(all)).toEqual(['p1: frame before', 'p1: frame moving', 'p1: drop']);
  });

  it("names a click the page's own code made by its view and number", () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('before', 0, 0),
      click('button#go', 201, { happenedAtMs: 200, trusted: false }),
      shown('after', 213, 212),
      quiet(463),
      navigated('b'),
      shown('b before', 500, 499),
      click('button#go', 601, { happenedAtMs: 600, trusted: false }),
      shown('b after', 613, 612),
      quiet(863),
    ]);

    expect(read(all)).toEqual([
      'v1-c1: frame before',
      'v1-c1: frame after',
      'v1-c1: keep 11-post-click-01',
      'v2-c1: frame b before',
      'v2-c1: frame b after',
      'v2-c1: keep 11-post-click-01',
    ]);
  });

  it('makes no clip for a click the browser made with no press reported', () => {
    const { shown, writes } = script();
    const all = writes([
      navigated('a'),
      shown('before', 0, 0),
      click('button#go', 201, { happenedAtMs: 200, trusted: true }),
      shown('after', 213, 212),
      quiet(463),
    ]);

    expect(all).toEqual([]);
  });

  it('keeps the clip of a click that changes the route with its 11, under the view it was clicked in', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a', 'https://app.example/'),
      shown('home', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170, selector: 'a#inbox' }),
      withinDocument('https://app.example/inbox', 'a'),
      shown('inbox', 190, 189),
      quiet(440),
    ]);

    expect(read(all)).toEqual(['p1: frame home', 'p1: frame inbox', 'p1: keep 11-post-click-01']);
    const kept = all.find((write) => write.type === 'keep');
    expect(kept?.type === 'keep' && kept.capture.viewId).toBe(1);
  });

  it('writes nothing once the response has come to rest', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      // A slow response: nothing for 600 ms, then the calendar changes.
      shown('dec', 700, 699),
      quiet(950),
    ]);

    expect(read(all)).toEqual(['p1: frame oct', 'p1: frame nov', 'p1: keep 11-post-click-01']);
  });

  it('drops a clip that ran past its 11: a later press made the 11 the screen before it', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      press('p2', 301, { happenedAtMs: 300 }), // held down past the rest
      shown('dec', 313, 312),
      quiet(563),
      click('button#go', 701, { pressId: 'p2', trusted: true }),
      quiet(951),
    ]);

    expect(read(all)).toEqual([
      'p1: frame oct',
      'p1: frame nov',
      'p1: frame dec',
      'p2: frame nov',
      'p2: frame dec',
      // p1's 11 is nov, the screen before p2, but its clip ran on to dec.
      'p1: drop',
      'p2: keep 11-post-click-02',
    ]);
  });

  it('starts by arrival order, not frame index, which starts over when the compositor is attached again', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('before', 0, 0, 50),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('reattached', 113, 112, 1),
      click('button#go', 170, { pressId: 'p1', trusted: true }),
      quiet(420),
    ]);

    expect(read(all)).toEqual(['p1: frame before', 'p1: frame reattached', 'p1: keep 11-post-click-01']);
  });

  it('ends every clip that got a frame exactly once, with its last write', () => {
    const { shown, writes } = script();
    const all = writes([
      navigated('a'),
      shown('a', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('b', 113, 112)]),
      press('drag', 301, { happenedAtMs: 300 }),
      shown('c', 313, 312),
      pressEnded('drag', 350),
      quiet(600),
      click('button#go', 801, { happenedAtMs: 800, trusted: false }),
      shown('d', 813, 812),
      ...pressAndClick('p3', { at: 901, drawnAt: 900, clickAt: 970 }, [shown('e', 913, 912)]),
      { type: 'stop' },
    ]);

    const ids = [...new Set(all.map((write) => write.id))];
    for (const id of ids) {
      const own = all.filter((write) => write.id === id);
      const endings = own.filter((write) => write.type !== 'frame');
      expect(endings, id).toHaveLength(1);
      expect(own.at(-1), id).toBe(endings[0]);
    }
  });
});
