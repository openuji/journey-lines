import { describe, expect, it } from 'vitest';
import { frameIndexAt, frameSeekTime, keyboardFrame, previewPlacement, rangeTimeAt } from '../src/ui/ClipRange/clip-range';

const trace = [{ frameIndex: 1, atMs: 0 }, { frameIndex: 2, atMs: 100 }, { frameIndex: 3, atMs: 600 }];
const previewSize = { width: 224, height: 160, margin: 8 };

describe('recorded frame selection', () => {
  it('selects the preceding recorded frame across uneven intervals', () => {
    expect([-1, 0, 99, 100, 599, 600, 999].map((time) => frameIndexAt(trace, time))).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(frameIndexAt([], 100)).toBe(0);
    expect(frameIndexAt(trace.slice(0, 1), 100)).toBe(0);
  });
  it('maps pointer position to time and clamps the endpoints', () => {
    expect([0, 10, 60, 110, 200].map((x) => rangeTimeAt(x, 10, 100, 600))).toEqual([0, 0, 300, 600, 600]);
  });
  it('steps by recorded frame, with Home/End and bounded arrows', () => {
    expect(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab', 'Escape'].map((key) => keyboardFrame(key, 1, 2))).toEqual([0, 2, 0, 2, undefined, undefined]);
    expect(keyboardFrame('ArrowLeft', 0, 2)).toBe(0);
    expect(keyboardFrame('ArrowRight', 2, 2)).toBe(2);
  });
  it('seeks within the selected interval even for frames only 1 ms apart', () => {
    expect(frameSeekTime(trace, 1)).toBeGreaterThan(0.1);
    expect(frameSeekTime(trace, 1)).toBeLessThan(0.6);
    expect(frameSeekTime([{ frameIndex: 1, atMs: 0 }, { frameIndex: 2, atMs: 1 }], 0)).toBeLessThan(0.001);
  });
});

describe('floating preview placement', () => {
  it('uses available space above or below the range', () => {
    const viewport = { width: 360, height: 800 };
    expect(previewPlacement({ left: 180, right: 180, top: 400, bottom: 404 }, viewport, previewSize).top).toBe(232);
    expect(previewPlacement({ left: 180, right: 180, top: 10, bottom: 14 }, viewport, previewSize).top).toBe(22);
  });
  it.each([{ width: 320, height: 800 }, { width: 480, height: 800 }, { width: 180, height: 120 }])('keeps all edges inside the viewport %o', (viewport) => {
    for (const x of [0, viewport.width]) {
      const placement = previewPlacement({ left: x, right: x, top: viewport.height - 10, bottom: viewport.height }, viewport, previewSize);
      expect(placement.left).toBeGreaterThanOrEqual(8);
      expect(placement.top).toBeGreaterThanOrEqual(8);
      expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(placement.top + placement.height).toBeLessThanOrEqual(viewport.height - 8);
    }
  });
});
