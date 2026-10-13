import { describe, expect, it } from 'vitest';
import { formatClock } from '../src/lib/journey';

describe('journey formatting', () => {
  it('shows time as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61_999)).toBe('01:01');
    expect(formatClock(-5)).toBe('00:00');
  });
});
