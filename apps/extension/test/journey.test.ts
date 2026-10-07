import { describe, expect, it } from 'vitest';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { captureKind, formatClock, journeyRows } from '../src/lib/journey';

function capture(viewId: number, label: string, receivedAtMs: number): MilestoneCapture {
  return {
    viewId,
    entry: viewId === 1 ? 'load' : 'route',
    url: `https://app.example/${viewId}`,
    label,
    frame: { receivedAtMs },
  } as MilestoneCapture;
}

describe('journey rows', () => {
  it('names each capture by what the rules saw', () => {
    expect(
      [
        '00-first',
        '02-settled',
        '03-pre-scroll-01',
        '04-post-scroll-01',
        '10-pre-click-01',
        '11-post-click-01',
        '99-before-navigation',
      ].map(captureKind),
    ).toEqual(['view', 'view', 'scroll', 'scroll', 'click', 'click', 'leave']);
  });

  it('opens each view with a divider and times captures from the start', () => {
    const rows = journeyRows(
      [
        capture(1, '00-first', 1_500),
        capture(1, '99-before-navigation', 3_000),
        capture(2, '00-first', 3_100),
      ],
      1_000,
    );

    expect(rows.map((row) => (row.kind === 'view' ? `view ${row.url}` : `${row.atMs} ${row.capture.label}`))).toEqual([
      'view https://app.example/1',
      '500 00-first',
      '2000 99-before-navigation',
      'view https://app.example/2',
      '2100 00-first',
    ]);
  });

  it("puts a video on the row of the capture it belongs to, by view and label", () => {
    const video = { viewId: 2, label: '04-post-scroll-01' } as Clip;
    const rows = journeyRows(
      [
        capture(1, '04-post-scroll-01', 1_100),
        capture(2, '03-pre-scroll-01', 1_200),
        capture(2, '04-post-scroll-01', 1_300),
      ],
      1_000,
      [video],
    );

    expect(rows.flatMap((row) => (row.kind === 'capture' ? [`${row.capture.viewId} ${row.capture.label} ${row.clip ? 'video' : '-'}`] : []))).toEqual([
      '1 04-post-scroll-01 -',
      '2 03-pre-scroll-01 -',
      '2 04-post-scroll-01 video',
    ]);
  });

  it('shows time as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61_999)).toBe('01:01');
    expect(formatClock(-5)).toBe('00:00');
  });
});
