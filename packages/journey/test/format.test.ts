import { describe, expect, it } from 'vitest';
import { formatClock, formatDate, siteOf } from '../src/format.js';

describe('journey formatting', () => {
  it('shows time as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(61_999)).toBe('01:01');
    expect(formatClock(-5)).toBe('00:00');
  });

  it('names a site by its host, without www', () => {
    expect(siteOf('https://www.google.com/maps/place/x')).toBe('google.com');
    expect(siteOf('https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/a.html?b=1')).toBe('veranstaltung.weiterbildung.fu-berlin.de');
    expect(siteOf('about:blank')).toBe('');
    expect(siteOf('not a url')).toBe('not a url');
  });

  it('shows a date with its day and time', () => {
    const date = formatDate(Date.UTC(2026, 9, 13, 10, 30));
    expect(date).toMatch(/Oct 1[34], 2026/);
    expect(date).toMatch(/\d{1,2}:\d{2}/);
  });
});
