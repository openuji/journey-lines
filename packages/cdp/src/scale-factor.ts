import type { Viewport } from './target.js';
import type { CdpTransport } from './transport.js';

/**
 * Render the page at device scale factor 1 while it is recorded.
 *
 * At any other scale factor — a HiDPI screen's own included — Chrome reports
 * every screencast frame at scroll offset 0 (seen on Chrome 154), so captures
 * would carry no scroll position. Without a viewport, width and height 0
 * leave the layout to the real window, so the page still reflows when its
 * window is resized. With one (a headless browser, which has no real window),
 * the page is laid out at exactly that size.
 *
 * The override is per tab and survives cross-site navigations.
 */
export async function pinScaleFactor(cdp: CdpTransport, viewport?: Viewport): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport?.width ?? 0,
    height: viewport?.height ?? 0,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

/** Back to the screen's own scale factor, for a tab the user keeps. */
export async function clearScaleFactor(cdp: CdpTransport): Promise<void> {
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}
