import { describe, expect, it } from 'vitest';
import { formatClock, formatDate } from '../src/format.js';

describe('journey formatting', () => {
  it('shows time as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61_999)).toBe('01:01');
    expect(formatClock(-5)).toBe('00:00');
  });

  it('shows a date with its day and time', () => {
    const date = formatDate(Date.UTC(2026, 9, 13, 10, 30));
    expect(date).toMatch(/Oct 1[34], 2026/);
    expect(date).toMatch(/\d{1,2}:\d{2}/);
  });
});
