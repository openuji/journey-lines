/**
 * How the panel and the report write times and addresses. What a capture
 * means is decided once, in `journey-events.ts`.
 */

/** `mm:ss`, as the panel shows every time. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Host and path: enough to tell views apart without the noise of a full URL. */
export function shortUrl(url: string): string {
  try {
    const { host, pathname, search, hash } = new URL(url);
    return `${host}${pathname}${search}${hash}`;
  } catch {
    return url;
  }
}

/** The site a view belongs to, as a reader names it: the host without `www.`; empty for a page with no host. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const dateTime = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** When something started, as a list of journeys shows it, in the time zone it is rendered in. */
export function formatDate(epochMs: number): string {
  return dateTime.format(epochMs);
}
