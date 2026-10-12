import { describe, expect, it } from 'vitest';
import {
  clipDurationMs,
  frameSeekTime,
  keyboardFrame,
  sampleFrameIndices,
} from '../src/ui/ClipFilmstrip/clip-filmstrip';
import { previewPlacement } from '../src/ui/FloatingPreview/floating-preview';

const trace = [{ frameIndex: 1, atMs: 0 }, { frameIndex: 2, atMs: 100 }, { frameIndex: 3, atMs: 600 }];
const previewSize = { width: 224, height: 160, margin: 8 };

describe('filmstrip sampling', () => {
  it('keeps short traces intact and samples long traces evenly with both endpoints', () => {
    expect(sampleFrameIndices(0)).toEqual([]);
    expect(sampleFrameIndices(1)).toEqual([0]);
    expect(sampleFrameIndices(2)).toEqual([0, 1]);
    expect(sampleFrameIndices(3)).toEqual([0, 1, 2]);
    expect(sampleFrameIndices(4)).toEqual([0, 2, 3]);
    expect(sampleFrameIndices(7)).toEqual([0, 3, 6]);
  });

  it('honours a smaller limit without losing the endpoints', () => {
    expect(sampleFrameIndices(7, 2)).toEqual([0, 6]);
    expect(sampleFrameIndices(7, 1)).toEqual([0]);
    expect(sampleFrameIndices(7, 0)).toEqual([]);
  });

  it('seeks within the selected interval and derives duration from the trace', () => {
    expect(frameSeekTime(trace, 1)).toBeGreaterThan(0.1);
    expect(frameSeekTime(trace, 1)).toBeLessThan(0.6);
    expect(frameSeekTime([{ frameIndex: 1, atMs: 0 }, { frameIndex: 2, atMs: 1 }], 0)).toBeLessThan(0.001);
    expect(clipDurationMs(trace)).toBe(600);
    expect(clipDurationMs([])).toBe(0);
  });

  it('moves keyboard focus between sampled frames', () => {
    expect(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab', 'Escape'].map((key) => keyboardFrame(key, 1, 2))).toEqual([0, 2, 0, 2, undefined, undefined]);
    expect(keyboardFrame('ArrowLeft', 0, 2)).toBe(0);
    expect(keyboardFrame('ArrowRight', 2, 2)).toBe(2);
  });
});

describe('floating preview placement', () => {
  it('uses available space above or below the frame', () => {
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
