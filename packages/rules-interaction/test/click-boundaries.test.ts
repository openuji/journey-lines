import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@journey-lines/core';
import { RulesEngine } from '@journey-lines/engine';
import { ClickEpisodeRule } from '../src/click.js';
import {
  frameEvent, navigated, press, pressEnded, quiet,
} from '../../engine/test/helpers.js';

const shown = (name: string, receivedAtMs: number, drawnAtMs?: number): DomainEvent =>
  frameEvent({ base64: name, receivedAtMs, drawnAtMs });

function record(events: readonly DomainEvent[]) {
  const engine = new RulesEngine([ClickEpisodeRule]);
  const output = events.map((event) => engine.processEvent(event));
  return { engine, output, captures: output.flatMap((part) => part.captures) };
}

describe('boundary evidence and publication are separate decisions', () => {
  it.each(['before', 'after'] as const)(
    'accepts timed pre-input evidence after an untimed frame delivered %s the press report', (arrival) => {
      const action = press('p1', 101, { happenedAtMs: 100 });
      const untimed = shown('untimed', arrival === 'before' ? 90 : 110);
      const { captures } = record([
        navigated('a'), shown('old', 0, 0),
        ...(arrival === 'before' ? [untimed, action] : [action, untimed]),
        shown('before', 120, 95), shown('after', 130, 115),
        pressEnded('p1', 170), quiet(420),
      ]);
      expect(captures.map((capture) => capture.frame.base64)).toEqual(['before', 'after']);
    },
  );

  it('preserves immediate arrival-fallback publication and freezes both sides of that split', () => {
    const { output, captures } = record([
      navigated('a'), shown('old', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }), shown('untimed', 120),
      press('p2', 201, { happenedAtMs: 200 }),
      shown('better-but-published', 220, 195), shown('after', 240, 210),
      pressEnded('p2', 270), quiet(520),
    ]);
    expect(output[4]?.captures.map((capture) => capture.label)).toEqual([
      '10-pre-click-01', '11-post-click-01',
    ]);
    expect(captures[1]?.frame).toBe(captures[2]?.frame);
    expect(captures[2]?.frame.base64).toBe('untimed');
    expect(captures[2]?.detail).toContain('placed by arrival');
  });

  it('retains both kinds of timing evidence across same-tab reattachment', () => {
    const { captures } = record([
      navigated('a'), shown('old', 0, 0),
      press('p1', 101, { happenedAtMs: 100 }),
      { type: 'session-changed', otherTab: false, receivedAtMs: 105 },
      navigated('a', undefined, 108), shown('untimed', 110),
      shown('before', 120, 95), shown('after', 130, 115),
      pressEnded('p1', 170), quiet(420),
    ]);
    expect(captures.map((capture) => capture.frame.base64)).toEqual(['before', 'after']);
  });

  it('keeps arrival fallback when input time is absent even if later frames have draw times', () => {
    const { captures } = record([
      navigated('a'), shown('before', 0, 0), press('p1', 101),
      shown('later', 120, 95), pressEnded('p1', 170), quiet(420),
    ]);
    expect(captures.map((capture) => capture.frame.base64)).toEqual(['before', 'later']);
    expect(captures.every((capture) => capture.detail.includes('placed by arrival'))).toBe(true);
  });

  it('does not freeze the successor when completing a predecessor without any image', () => {
    const { output, captures } = record([
      navigated('a'), press('p1', 101, { happenedAtMs: 100 }),
      press('p2', 201, { happenedAtMs: 200 }), quiet(451),
      shown('before-p2', 500, 195), shown('after-p2', 520, 510),
      pressEnded('p2', 550), quiet(800),
    ]);
    expect(output[3]?.captures).toEqual([]);
    expect(captures.map((capture) => [capture.label, capture.frame.base64])).toEqual([
      ['10-pre-click-02', 'before-p2'], ['11-post-click-02', 'after-p2'],
    ]);
  });
});
