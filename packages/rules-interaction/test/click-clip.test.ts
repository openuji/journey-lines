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
      pressEnded('p1', 170),
      quiet(420),
    ]);

    expect(read(all)).toEqual(['p1: frame before', 'p1: frame after', 'p1: keep 11-post-click-01']);
  });

  it('splits quick presses into consecutive clips with a shared boundary frame', () => {
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
      'p1: keep 11-post-click-01',
      'p2: frame nov',
      'p2: frame dec',
      'p2: keep 11-post-click-02',
      'p3: frame dec',
      'p3: frame jan',
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

  it('keeps the clip of a press that ended without a click', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('rest', 0, 0),
      press('drag', 101, { happenedAtMs: 100 }),
      shown('dragged', 150, 140),
      pressEnded('drag', 200),
      quiet(450),
      shown('later', 500, 499),
    ]);

    expect(read(all)).toEqual(['drag: frame rest', 'drag: frame dragged', 'drag: keep 11-post-click-01']);
  });

  it('keeps both the completed and still-moving segment at Stop', () => {
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
      'p1: keep 11-post-click-01',
      'p2: frame moving',
      'p2: frame still moving',
      'p2: keep 11-post-click-02',
    ]);
  });

  it('keeps the old tab clip and excludes new-tab frames, including ones before its document report', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('before', 0, 0, 1),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('moving', 113, 112, 2),
      { type: 'session-changed', otherTab: true, receivedAtMs: 180 },
      shown('too early in other tab', 900, 899, 1),
      navigated('other-tab', undefined, 1_000),
      shown('other before', 1_010, 1_009, 2),
      press('p2', 1_101, { happenedAtMs: 1_100 }),
      shown('other after', 1_113, 1_112, 3),
      { type: 'stop' },
    ]);

    expect(read(all)).toEqual([
      'p1: frame before', 'p1: frame moving', 'p1: keep 11-post-click-01',
      'p2: frame other before', 'p2: frame other after', 'p2: keep 11-post-click-01',
    ]);
    expect(all.flatMap((write) => write.type === 'keep' ? [write.capture.viewId] : [])).toEqual([1, 2]);
  });

  it('keeps the observed clip at Stop while the new tab has not reported, and closes only once', () => {
    const { shown, read } = script();
    const engine = new RulesEngine([ClickEpisodeRule]);
    for (const event of [
      navigated('a'), shown('before', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }), shown('moving', 113, 112),
      { type: 'session-changed', otherTab: true, receivedAtMs: 180 } as const,
      shown('new tab excluded', 200, 199), quiet(450),
    ]) engine.processEvent(event);

    const stopped = engine.processEvent({ type: 'stop' });
    expect(read(stopped.clipWrites)).toEqual([
      'p1: frame before', 'p1: frame moving', 'p1: keep 11-post-click-01',
    ]);
    expect(stopped.captures[1]?.detail).toContain('recording stopped');
    expect(engine.currentState.ruleStates[ClickEpisodeRule.id]).toEqual({
      episodeCount: 1, open: null, closing: [], seen: [],
    });
    expect(engine.processEvent({ type: 'stop' })).toEqual({ captures: [], clipWrites: [] });
  });

  it.each(['stop', 'tab'] as const)('flushes an earlier boundary and the current still segment on %s', (ending) => {
    const { shown, read } = script();
    const engine = new RulesEngine([ClickEpisodeRule]);
    for (const event of [
      navigated('a'), shown('before', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }), shown('middle', 113, 112),
      press('p2', 151, { happenedAtMs: 150 }),
    ]) expect(engine.processEvent(event).clipWrites).toEqual([]);
    if (ending === 'tab') engine.processEvent({ type: 'session-changed', otherTab: true, receivedAtMs: 160 });
    const ended = engine.processEvent(ending === 'stop'
      ? { type: 'stop' }
      : navigated('b', undefined, 170));

    expect(read(ended.clipWrites)).toEqual([
      'p1: frame before', 'p1: frame middle', 'p1: keep 11-post-click-01',
    ]);
    expect(ended.captures.map((capture) => capture.label)).toEqual([
      '10-pre-click-01', '11-post-click-01', '10-pre-click-02', '11-post-click-02',
    ]);
    expect(ended.captures[1]?.frame).toBe(ended.captures[2]?.frame);
    expect(ended.captures[2]?.frame).toBe(ended.captures[3]?.frame);
    expect(engine.currentState.ruleStates[ClickEpisodeRule.id]).toMatchObject({ open: null, closing: [], seen: [] });
  });

  it.each([false, true])('invents no pre-frame at Stop (response observed: %s)', (responded) => {
    const { shown } = script();
    const engine = new RulesEngine([ClickEpisodeRule]);
    engine.processEvent(navigated('a'));
    engine.processEvent(press('p1', 101, { happenedAtMs: 100 }));
    if (responded) engine.processEvent(shown('after', 113, 112));
    const stopped = engine.processEvent({ type: 'stop' });
    expect(stopped.captures.map((capture) => capture.label)).toEqual(responded ? ['11-post-click-01'] : []);
    expect(stopped.clipWrites).toEqual([]);
  });

  it('continues a held segment through same-tab reattachment and does not close a finished clip again', () => {
    const { shown, read } = script();
    const engine = new RulesEngine([ClickEpisodeRule]);
    for (const event of [
      navigated('a'), shown('before', 0, 0, 40),
      press('p1', 101, { happenedAtMs: 100 }), shown('moving', 113, 112, 41),
      { type: 'session-changed', otherTab: false, receivedAtMs: 180 } as const,
      navigated('a', undefined, 190), shown('after', 200, 199, 1),
      pressEnded('p1', 210),
    ]) expect(engine.processEvent(event).clipWrites).toEqual([]);
    expect(read(engine.processEvent(quiet(460)).clipWrites)).toEqual([
      'p1: frame before', 'p1: frame moving', 'p1: frame after', 'p1: keep 11-post-click-01',
    ]);
    engine.processEvent({ type: 'session-changed', otherTab: true, receivedAtMs: 500 });
    expect(engine.processEvent(navigated('b', undefined, 510))).toEqual({ captures: [], clipWrites: [] });
    expect(engine.processEvent({ type: 'stop' })).toEqual({ captures: [], clipWrites: [] });
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

  it('keeps October to November and November to December even when the second press has no click', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      press('p2', 301, { happenedAtMs: 300 }), // held down past the rest
      shown('dec', 313, 312),
      quiet(563),
      pressEnded('p2', 701),
      quiet(951),
    ]);

    expect(read(all)).toEqual([
      'p1: frame oct',
      'p1: frame nov',
      'p1: keep 11-post-click-01',
      'p2: frame nov',
      'p2: frame dec',
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
      pressEnded('p1', 170),
      quiet(420),
    ]);

    expect(read(all)).toEqual(['p1: frame before', 'p1: frame reattached', 'p1: keep 11-post-click-01']);
  });

  it.each(['before', 'after'] as const)('places the shared boundary when its picture arrives %s the next press report', (arrival) => {
    const { shown, writes, read } = script();
    const boundary = shown('boundary', arrival === 'before' ? 295 : 310, 290);
    const nextResponse = shown('next response', arrival === 'before' ? 299 : 315, 305);
    const second = press('p2', 301, { happenedAtMs: 300 });
    const all = writes([
      navigated('a'),
      shown('oct', 0, 0),
      ...pressAndClick('p1', { at: 101, drawnAt: 100, clickAt: 170 }, [shown('nov', 113, 112)]),
      ...(arrival === 'before' ? [boundary, nextResponse, second] : [second, boundary, nextResponse]),
      pressEnded('p2', 350),
      quiet(600),
    ]);
    expect(read(all)).toEqual([
      'p1: frame oct', 'p1: frame nov', 'p1: frame boundary', 'p1: keep 11-post-click-01',
      'p2: frame boundary', 'p2: frame next response', 'p2: keep 11-post-click-02',
    ]);
  });

  it('keeps multiple presses before the next frame as separate, non-overlapping segments', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'), shown('before', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }),
      shown('middle', 113, 112),
      press('p2', 151, { happenedAtMs: 150 }),
      press('p3', 161, { happenedAtMs: 160 }),
      shown('after', 180, 179),
      pressEnded('p3', 200), quiet(450),
    ]);
    // p2 has the same before/after picture, so it has captures but no still video.
    expect(read(all)).toEqual([
      'p1: frame before', 'p1: frame middle', 'p1: keep 11-post-click-01',
      'p3: frame middle', 'p3: frame after', 'p3: keep 11-post-click-03',
    ]);
  });

  it('gives a script click during a held press its own segment and clip ID', () => {
    const { shown, writes, read } = script();
    const all = writes([
      navigated('a'), shown('X', 0, 0),
      press('physical', 101, { happenedAtMs: 100 }), shown('Y', 113, 112),
      click('button#script', 150, { happenedAtMs: 149, pressId: 'physical', trusted: false }),
      shown('Z', 160, 159),
      click('button#physical', 170, { pressId: 'physical', trusted: true }),
      pressEnded('physical', 171), quiet(421),
    ]);
    expect(read(all)).toEqual([
      'physical: frame X', 'physical: frame Y', 'physical: keep 11-post-click-01',
      'v1-c2: frame Y', 'v1-c2: frame Z', 'v1-c2: keep 11-post-click-02',
    ]);
  });

  it('does not encode a segment until its boundary is known, then releases its frames', () => {
    const { shown } = script();
    const engine = new RulesEngine([ClickEpisodeRule]);
    const initial = [navigated('a'), shown('before', 0, 0), press('p1', 101, { happenedAtMs: 100 })];
    for (const event of initial) expect(engine.processEvent(event).clipWrites).toEqual([]);
    for (let i = 0; i < 10; i++) {
      expect(engine.processEvent(shown(`frame-${i}`, 120 + i * 20, 119 + i * 20)).clipWrites).toEqual([]);
    }
    engine.processEvent(pressEnded('p1', 310));
    const ended = engine.processEvent(quiet(560));
    const samples = ended.clipWrites.flatMap((write) => write.type === 'frame' ? [write.frame] : []);
    expect(samples[0]).toBe(ended.captures[0]?.frame);
    expect(samples.at(-1)).toBe(ended.captures[1]?.frame);
    expect(ended.clipWrites.at(-1)?.type).toBe('keep');
    expect(engine.currentState.ruleStates[ClickEpisodeRule.id]).toMatchObject({ open: null, closing: [] });
    const seen = (engine.currentState.ruleStates[ClickEpisodeRule.id] as { seen: readonly unknown[] }).seen;
    expect(seen.length).toBeLessThan(samples.length);
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
