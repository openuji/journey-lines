import { describe, expect, it } from 'vitest';
import { RulesEngine, type MilestoneRule } from '@openuji/engine';
import type { ClipWrite, DomainEvent, MilestoneCapture } from '@openuji/core';
import { ClickEpisodeRule, clickEpisodeRule } from '@openuji/rules-interaction';
import { ScrollEpisodeRule, scrollEpisodeRule } from '@openuji/rules-interaction';
import {
  frameEvent, navigated, press, pressEnded, quiet, click, pageAt, pageScroll,
  moved, scrollCause,
} from '../../engine/test/helpers.js';

const shown = (name: string, receivedAtMs: number, drawnAtMs = receivedAtMs - 1, index?: number): DomainEvent =>
  frameEvent({ base64: name, receivedAtMs, drawnAtMs, ...(index === undefined ? {} : { index }) });
const read = (captures: readonly MilestoneCapture[]) => captures.map((c) => `${c.label} ${c.frame.base64}`);
function run(events: readonly DomainEvent[], rules: readonly MilestoneRule[] = [ClickEpisodeRule]) {
  const engine = new RulesEngine(rules);
  const outputs = events.map((e) => engine.processEvent(e));
  return { engine, outputs, captures: outputs.flatMap((o) => o.captures), writes: outputs.flatMap((o) => o.clipWrites) };
}
const frames = (writes: readonly ClipWrite[]) => writes.flatMap((w) => w.type === 'frame' ? [w] : []);

describe('interaction invariants', () => {
  it('freezes both sides of a published split', () => {
    const result = run([
      navigated('a'), shown('old', 0, 0), press('p1', 101, { happenedAtMs: 100 }),
      press('p2', 201, { happenedAtMs: 200 }), quiet(451),
      shown('late-before-p2', 500, 195), shown('after-p2', 520, 510),
      pressEnded('p2', 550), quiet(800),
    ]);
    expect(result.captures[1]?.frame).toBe(result.captures[2]?.frame);
    expect(result.captures[2]?.frame.base64).toBe('old');
  });

  it('uses an unpaired browser click as a cut without inventing its pre-capture', () => {
    const result = run([
      navigated('a'), shown('before', 0, 0), press('p1', 101, { happenedAtMs: 100 }),
      shown('middle', 120, 119), click('button#unknown', 201, { trusted: true, happenedAtMs: 200 }),
      shown('after', 220, 219), quiet(470),
    ]);
    expect(read(result.captures)).toEqual([
      '10-pre-click-01 before', '11-post-click-01 middle', '11-post-click-02 after',
    ]);
    expect(new Set(result.writes.map((w) => w.id))).toEqual(new Set(['click-episode-p1']));
  });

  it('seals the shared cut when a short limit publishes the tail before the delivery allowance', () => {
    const result = run([
      navigated('a'), shown('before', 0, 0), press('p1', 101, { happenedAtMs: 100 }),
      press('p2', 120, { happenedAtMs: 119 }), pageAt(0, 170),
      shown('too-late', 200, 118), quiet(450),
    ], [clickEpisodeRule({ stillMovingMs: 50 })]);
    expect(result.captures.map((c) => c.label)).toEqual([
      '10-pre-click-01', '11-post-click-01', '10-pre-click-02', '11-post-click-02',
    ]);
    expect(result.captures[1]?.frame).toBe(result.captures[2]?.frame);
    expect(result.captures[3]?.detail).toContain('observation limit');
  });

  it('does not force adjacency after an earlier segment rested', () => {
    const result = run([
      navigated('a'), shown('before', 0, 0), press('p1', 101, { happenedAtMs: 100 }),
      shown('first-end', 120, 119), pressEnded('p1', 150), quiet(400),
      shown('unrelated', 500, 499), press('p2', 601, { happenedAtMs: 600 }),
      shown('second-end', 620, 619), pressEnded('p2', 650), quiet(900),
    ]);
    expect(result.captures[1]?.frame.base64).toBe('first-end');
    expect(result.captures[2]?.frame.base64).toBe('unrelated');
  });

  it('keeps filing ownership while taking click position from the selected frame', () => {
    const result = run([
      navigated('a', 'https://example.com/a'), pageAt(900, 1), shown('a', 10, 9),
      press('p1', 101, { happenedAtMs: 100 }), pressEnded('p1', 170),
      {
        type: 'navigated', frameId: 'main', isMainFrame: true, loaderId: 'a',
        url: 'https://example.com/b', sameDocument: true, receivedAtMs: 180,
      },
      pageAt(0, 185), shown('b', 190, 189), quiet(440),
    ]);
    const post = result.captures[1]!;
    expect(post).toMatchObject({ viewId: 1, url: 'https://example.com/a', position: { y: 0 } });
    expect(frames(result.writes).at(-1)?.position).toEqual(post.position);
  });

  it('does not retrofit resumed-scroll positions onto retained frames', () => {
    const result = run([
      navigated('a'), pageAt(0, 0), shown('rest', 10), ...moved(100, 300),
      shown('moving', 320), pageAt(50, 400), shown('pause-1', 500),
      pageAt(200, 600), shown('pause-2', 650), ...moved(300, 700),
      pageScroll(300, 710, { ended: true }), shown('landed', 730), quiet(960),
    ], [ScrollEpisodeRule]);
    expect(frames(result.writes).map((w) => [w.frame.base64, w.position?.y])).toEqual([
      ['rest', 0], ['moving', 100], ['pause-1', 50], ['pause-2', 200], ['landed', 300],
    ]);
  });

  it('streams a long scroll without retaining its emitted raw frame history', () => {
    const engine = new RulesEngine([ScrollEpisodeRule]);
    for (const e of [navigated('a'), pageAt(0), shown('rest', 10), ...moved(100, 300)]) engine.processEvent(e);
    for (let i = 1; i <= 1_000; i++) {
      engine.processEvent(pageScroll(100 + i, 300 + i * 20));
      const out = engine.processEvent(shown(`frame-${i}`, 305 + i * 20));
      expect(frames(out.clipWrites)).toHaveLength(1);
      expect(out.clipWrites.some((w) => w.type === 'keep')).toBe(false);
    }
    const state = engine.currentState.ruleStates[ScrollEpisodeRule.id] as {
      recent: readonly unknown[]; open: { unconfirmedFrames: readonly unknown[] };
    };
    expect(state.recent.length).toBeLessThan(10);
    expect(state.open.unconfirmedFrames).toEqual([]);
  });

  it('keeps candidate identity unique after a discard and a compositor index restart', () => {
    const result = run([
      navigated('a'), pageAt(0), shown('rest', 10, 9, 7), ...moved(3, 300),
      pageScroll(3, 300, { ended: true }), shown('jitter', 320, 319, 8), quiet(550),
      { type: 'session-changed', otherTab: false, receivedAtMs: 600 },
      navigated('a', undefined, 610), shown('rest-again', 700, 699, 7), ...moved(100, 1_000),
      pageScroll(100, 1_010, { ended: true }), shown('landed', 1_020, 1_019, 8), quiet(1_260),
    ], [ScrollEpisodeRule]);
    expect(new Set(result.writes.map((w) => w.id))).toEqual(new Set([
      'scroll-episode-v1-s1', 'scroll-episode-v1-s2',
    ]));
    expect(result.captures.map((c) => c.label)).toEqual(['03-pre-scroll-01', '04-post-scroll-01']);
  });

  it('retains output when a scroll opens and finishes in one evaluation', () => {
    const result = run([
      navigated('a'), pageAt(0), shown('rest', 10), shown('lead', 294),
      scrollCause('wheel', 300), pageScroll(100, 300),
    ], [scrollEpisodeRule({ silentEndMs: 0 })]);
    expect(result.writes.map((w) => w.type)).toEqual(['frame', 'frame', 'keep']);
    expect(frames(result.writes).at(-1)?.frame).toBe(result.captures[1]?.frame);
  });

  const overlap: readonly DomainEvent[] = [
    navigated('a'), pageAt(0), shown('rest', 10, 9), press('p1', 301, { happenedAtMs: 300 }),
    ...moved(100, 310), shown('moving', 325, 324), pageScroll(200, 340, { ended: true }),
    shown('landed', 350, 349), pressEnded('p1', 360), quiet(610),
  ];
  it('composes independent click and scroll outputs even when their video frames overlap', () => {
    const a = run(overlap, [ScrollEpisodeRule]);
    const b = run(overlap, [ClickEpisodeRule]);
    const together = run(overlap, [ScrollEpisodeRule, ClickEpisodeRule]);
    together.outputs.forEach((output, i) => {
      expect(output.captures).toEqual([...a.outputs[i]!.captures, ...b.outputs[i]!.captures]);
      expect(output.clipWrites).toEqual([...a.outputs[i]!.clipWrites, ...b.outputs[i]!.clipWrites]);
    });
    const clickFrames = new Set(frames(b.writes).map((w) => w.frame));
    expect(frames(a.writes).some((w) => clickFrames.has(w.frame))).toBe(true);
  });

  function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  }
  it('never mutates an earlier state or input shared by the two rules', () => {
    const engine = new RulesEngine([ScrollEpisodeRule, ClickEpisodeRule]);
    for (const event of overlap) {
      const previous = deepFreeze(engine.currentState);
      const snapshot = JSON.stringify(previous);
      engine.processEvent(deepFreeze(event));
      expect(JSON.stringify(previous)).toBe(snapshot);
    }
  });

  it.each(['normal', 'late pre-frame', 'early response'] as const)(
    'selects the same evidence with %s delivery', (ordering) => {
      const input = press('p1', ordering === 'early response' ? 130 : 101, { happenedAtMs: 100 });
      const pre = shown('before', ordering === 'late pre-frame' ? 120 : 99, 95);
      const post = shown('after', 125, 110);
      const middle = ordering === 'normal' ? [pre, input, post]
        : ordering === 'late pre-frame' ? [input, pre, post] : [pre, post, input];
      const result = run([navigated('a'), shown('old', 0, 0), ...middle, pressEnded('p1', 170), quiet(420)]);
      expect(read(result.captures)).toEqual(['10-pre-click-01 before', '11-post-click-01 after']);
      expect(frames(result.writes).map((w) => w.frame.base64)).toEqual(['before', 'after']);
    },
  );

  it('does not release the newest action when an earlier press releases', () => {
    const result = run([
      navigated('a'), shown('before', 0, 0), press('p1', 101, { happenedAtMs: 100 }),
      press('p2', 120, { happenedAtMs: 119 }), shown('after', 140, 139),
      pressEnded('p1', 150), quiet(400),
    ]);
    expect(result.captures.map((c) => c.label)).toEqual(['10-pre-click-01', '11-post-click-01']);
    expect(result.engine.currentState.ruleStates[ClickEpisodeRule.id]).toMatchObject({
      pending: [{ quietEligibleAtMs: null }],
    });
  });
});
