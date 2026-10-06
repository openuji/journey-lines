import type { CdpTransport } from './transport.js';

/**
 * Render the page at device scale factor 1 while it is recorded.
 *
 * At any other scale factor — a HiDPI screen's own included — Chrome reports
 * every screencast frame at scroll offset 0 (seen on Chrome 154), so captures
 * would carry no scroll position. Width and height 0
 * leave the layout to the real window, so the page still reflows when its
 * window is resized.
 *
 * The override is per tab and survives cross-site navigations.
 */
export async function pinScaleFactor(cdp: CdpTransport): Promise<void> {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 0,
    height: 0,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

/** Back to the screen's own scale factor, for a tab the user keeps. */
export async function clearScaleFactor(cdp: CdpTransport): Promise<void> {
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}
