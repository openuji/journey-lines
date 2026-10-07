/**
 * The extension host end to end: the built extension in Chrome for Testing,
 * recording through its own `chrome.debugger`, its pipeline running in the
 * service worker, its journey showing in the panel.
 *
 * Everything goes through the worker's debug handle, `globalThis.recorder` —
 * the same one a person inspects in DevTools — or through the panel's page.
 * `--force-device-scale-factor=2` makes the browser a HiDPI screen, even
 * under Xvfb in CI.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CdpTransport } from '@openuji/cdp';
import { QUIET_AFTER_MS } from '@openuji/core';
import { DocumentLabel } from '@openuji/rules-document';
import { episodeLabel, InteractionLabel } from '@openuji/rules-interaction';
import type { Recorder } from '../../apps/extension/src/lib/recorder';
import { launchWithExtension, type ExtensionBrowser } from './extension-browser.js';
import { BUTTON, startFixtureServer, type FixtureServer } from './fixture.js';
import { click, wheel } from './input.js';

declare global {
  // The service worker's debug handle (apps/extension/src/entrypoints/background.ts).
  var recorder: Recorder;
  // Set by the scale-factor test: the scroll offset of the latest frame.
  var frameScrollY: number | undefined;
}

const WAIT = { timeout: 15_000, interval: 50 };

const preClick = episodeLabel(InteractionLabel.preClick, 1);
const postClick = episodeLabel(InteractionLabel.postClick, 1);
const preScroll = episodeLabel(InteractionLabel.preScroll, 1);
const postScroll = episodeLabel(InteractionLabel.postScroll, 1);

const BUTTON_CENTER = { x: BUTTON.x + BUTTON.width / 2, y: BUTTON.y + BUTTON.height / 2 };
const SCROLL_POINT = { x: 400, y: 400 };

describe('extension host against a real browser', () => {
  let fixture: FixtureServer;
  let extension: ExtensionBrowser;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    extension = await launchWithExtension({
      executablePath: process.env['UXR_CHROME_EXECUTABLE'],
      args: ['--force-device-scale-factor=2'],
    });
  });

  afterAll(async () => {
    await extension?.close();
    await fixture?.close();
  });

  afterEach(async () => {
    await extension.worker.evaluate(async () => {
      await recorder.stop();
      recorder.reset();
      const reportPrefix = chrome.runtime.getURL('report.html');
      const reports = (await chrome.tabs.query({})).filter((tab) => tab.id !== undefined && tab.url?.startsWith(reportPrefix));
      await Promise.all(reports.map((tab) => chrome.tabs.remove(tab.id!)));
    });
  });

  /** A new tab in front, fully loaded. */
  const openTab = (url: string): Promise<number> =>
    extension.worker.evaluate(async (url) => {
      const tab = await chrome.tabs.create({ url });
      while ((await chrome.tabs.get(tab.id!)).status !== 'complete') {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return tab.id!;
    }, url);

  const record = (tabId: number, options = { video: false }): Promise<void> =>
    extension.worker.evaluate(
      async (tabId, options) => {
        const tab = await chrome.tabs.get(tabId);
        await recorder.record({ id: tabId, title: tab.title ?? '', url: tab.url ?? '' }, options);
      },
      tabId,
      options,
    );

  const hasEncoderDocument = (): Promise<boolean> =>
    extension.worker.evaluate(() => chrome.offscreen.hasDocument());

  /** A wheel scroll on a page that had time to rest, through to its 04. */
  const scrollOnce = async (deltaY = 600): Promise<void> => {
    await waitForLabel(DocumentLabel.first);
    // Long enough for a frame to be proven at rest: the scroll's "before".
    await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS * 2));
    await wheel(recordedTab, SCROLL_POINT.x, SCROLL_POINT.y, deltaY);
    await waitForLabel(postScroll);
  };

  const stop = (): Promise<void> => extension.worker.evaluate(() => recorder.stop());

  const labels = (): Promise<string[]> =>
    extension.worker.evaluate(() => recorder.captures.map((capture) => capture.label));

  const waitForLabel = (label: string): Promise<void> =>
    vi.waitFor(async () => expect(await labels()).toContain(label), WAIT);

  /** Commands for the recorded tab, over the extension's own debugger session. */
  const recordedTab: Pick<CdpTransport, 'send'> = {
    send: ((method: string, params?: object) =>
      extension.worker.evaluate(
        (method, params) => {
          if (!recorder.cdp) throw new Error('Nothing is being recorded');
          const send = recorder.cdp.send as (method: string, params?: object) => Promise<unknown>;
          return send(method, params);
        },
        method,
        params,
      )) as CdpTransport['send'],
  };

  /** `devicePixelRatio` of a tab nothing is recording, through a short-lived attach. */
  const scaleOfIdleTab = (tabId: number): Promise<number> =>
    extension.worker.evaluate(async (tabId) => {
      await chrome.debugger.attach({ tabId }, '1.3');
      try {
        const reply = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: 'devicePixelRatio',
          returnByValue: true,
        })) as { result: { value: number } };
        return reply.result.value;
      } finally {
        await chrome.debugger.detach({ tabId });
      }
    }, tabId);

  it('runs the browser it was asked for', async () => {
    const version = await extension.browser.version();
    console.info(`[extension] running ${version}`);

    const expected = process.env['UXR_CHROME_VERSION'];
    if (expected) expect(version.split('/').pop()).toBe(expected);
  });

  it('records a page that was already open: first frame, a click, the resting state', async () => {
    const tabId = await openTab(fixture.url('/'));

    await record(tabId);
    await waitForLabel(DocumentLabel.first);
    await click(recordedTab, BUTTON_CENTER.x, BUTTON_CENTER.y);
    await waitForLabel(postClick);
    await stop();

    // Attached after the page loaded: no 01/02, which happened before.
    expect(await labels()).toEqual([
      DocumentLabel.first,
      preClick,
      postClick,
      DocumentLabel.beforeNavigation,
    ]);
    expect(await extension.worker.evaluate(() => recorder.status)).toMatchObject({
      state: 'done',
      endedBy: 'user',
    });
  });

  it('records at scale factor 1 on a HiDPI screen, so frames carry the scroll offset, then gives the tab its own back', async () => {
    const tabId = await openTab(fixture.url('/'));
    expect(await scaleOfIdleTab(tabId)).toBe(2);

    await record(tabId);
    const { result } = await recordedTab.send('Runtime.evaluate', {
      expression: 'devicePixelRatio',
      returnByValue: true,
    });
    expect(result.value).toBe(1);

    await waitForLabel(DocumentLabel.first);
    await extension.worker.evaluate(() => {
      recorder.cdp?.on('Page.screencastFrame', ({ metadata }) => {
        frameScrollY = metadata.scrollOffsetY;
      });
    });
    // Long enough for a frame to be proven at rest: the scroll's "before".
    await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS * 2));
    await wheel(recordedTab, SCROLL_POINT.x, SCROLL_POINT.y, 600);
    // At scale factor 2 every frame would report 0. The command returns before
    // the page has scrolled, so wait for the frame that shows it.
    await vi.waitFor(
      async () => expect(await extension.worker.evaluate(() => frameScrollY)).toBe(600),
      WAIT,
    );

    // The frames carry the offset, so the scroll is captured from them, and a
    // click after it lands on frames that show where the page now is.
    await waitForLabel(postScroll);
    await click(recordedTab, SCROLL_POINT.x, SCROLL_POINT.y);
    await waitForLabel(postClick);
    await stop();

    const scrollYOf = (label: string): Promise<number | undefined> =>
      extension.worker.evaluate(
        (label) => recorder.captures.find((capture) => capture.label === label)?.position?.y,
        label,
      );
    expect(await scrollYOf(preScroll)).toBe(0);
    expect(await scrollYOf(postScroll)).toBe(600);
    expect(await scrollYOf(postClick)).toBe(600);
    expect(await scaleOfIdleTab(tabId)).toBe(2);
  });

  // As a person found it: maximizing the window recorded a scroll. Chrome
  // moves the page's offset to keep what is on screen in place, and reports
  // that as the page scrolling, but nothing started a scroll.
  it('a window resize that moves the page is no scroll', async () => {
    const tabId = await openTab(fixture.url('/fluid'));
    await record(tabId);
    await scrollOnce(1500);

    const scrollY = async (): Promise<number> =>
      (await recordedTab.send('Runtime.evaluate', { expression: 'scrollY', returnByValue: true })).result.value as number;
    const before = await scrollY();
    const widen = (by: number): Promise<void> =>
      extension.worker.evaluate(
        async (tabId, by) => {
          const { windowId } = await chrome.tabs.get(tabId);
          const { width = 0 } = await chrome.windows.get(windowId);
          await chrome.windows.update(windowId, { width: width + by });
        },
        tabId,
        by,
      );
    await widen(400);
    try {
      await vi.waitFor(async () => expect(await scrollY()).toBeGreaterThan(before), WAIT);
      // Longer than a scroll with no scrollend takes to end.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await stop();

      expect((await labels()).filter((label) => label.includes('-scroll-'))).toEqual([preScroll, postScroll]);
    } finally {
      await widen(-400);
    }
  });

  it('ends the recording when the tab closes, keeping the resting state', async () => {
    const tabId = await openTab(fixture.url('/'));
    await record(tabId);
    await waitForLabel(DocumentLabel.first);

    await extension.worker.evaluate((tabId) => chrome.tabs.remove(tabId), tabId);

    await vi.waitFor(
      async () =>
        expect(await extension.worker.evaluate(() => recorder.status)).toMatchObject({
          state: 'done',
          endedBy: 'tab-closed',
        }),
      WAIT,
    );
    expect((await labels()).at(-1)).toBe(DocumentLabel.beforeNavigation);
    const reportUrl = await extension.worker.evaluate(() => {
      if (recorder.status.state !== 'done' || !recorder.status.sessionId) throw new Error('No report session');
      return `${chrome.runtime.getURL('report.html')}?session=${encodeURIComponent(recorder.status.sessionId)}`;
    });
    const report = await (await extension.browser.waitForTarget((target) => target.url() === reportUrl)).page();
    if (!report) throw new Error('Report tab did not open after tab close');
    await vi.waitFor(async () => expect(await report.$('.report-capture__image-link img')).not.toBeNull(), WAIT);
  });

  it('shows the journey in the panel as it happens, then the summary', async () => {
    await openTab(fixture.url('/'));
    const panel = await extension.openPanel();

    const shownLabels = (): Promise<string[]> =>
      panel.$$eval('.capture-row__label', (rows) => rows.map((row) => row.textContent ?? ''));
    // A DOM click: the panel sits in a background tab, where mouse input would not land.
    const press = async (selector: string): Promise<void> => {
      await panel.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };

    // Record the active tab, as a person would from the panel.
    await vi.waitFor(async () => expect(await panel.$('.record-button')).not.toBeNull(), WAIT);
    await press('.record-button');
    await vi.waitFor(async () => expect(await shownLabels()).toContain(DocumentLabel.first), WAIT);

    await click(recordedTab, BUTTON_CENTER.x, BUTTON_CENTER.y);
    await vi.waitFor(async () => expect(await shownLabels()).toContain(postClick), WAIT);

    await press('.stop-button');
    await vi.waitFor(async () => expect(await panel.$('.summary')).not.toBeNull(), WAIT);
    expect(await shownLabels()).toEqual(await labels());

    const reportUrl = await extension.worker.evaluate(() => {
      if (recorder.status.state !== 'done' || !recorder.status.sessionId) throw new Error('No report session');
      return `${chrome.runtime.getURL('report.html')}?session=${encodeURIComponent(recorder.status.sessionId)}`;
    });
    const reportTarget = await extension.browser.waitForTarget((target) => target.url() === reportUrl);
    const report = await reportTarget.page();
    if (!report) throw new Error('Report tab did not open');
    await vi.waitFor(async () => expect(await report.$$('.report-capture__image-link img')).toHaveLength((await labels()).length), WAIT);
    expect(await report.$eval('.report-head h1', (heading) => heading.textContent)).toBe('uxr fixture');
    expect(await report.$('.report-bar__meta')).not.toBeNull();
    expect(await panel.$('.open-report-button')).not.toBeNull();

    const archiveFiles = await report.evaluate([
      '(async () => {',
      '  let downloadUrl = "";',
      '  const click = HTMLAnchorElement.prototype.click;',
      '  HTMLAnchorElement.prototype.click = function () { downloadUrl = this.href; };',
      '  try {',
      '    document.querySelector(".report-bar button").click();',
      '    const bytes = new Uint8Array(await (await fetch(downloadUrl)).arrayBuffer());',
      '    const view = new DataView(bytes.buffer);',
      '    const end = bytes.length - 22;',
      '    const count = view.getUint16(end + 10, true);',
      '    let offset = view.getUint32(end + 16, true);',
      '    const files = [];',
      '    for (let i = 0; i < count; i++) {',
      '      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid archive");',
      '      const length = view.getUint16(offset + 28, true);',
      '      files.push(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length)));',
      '      offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);',
      '    }',
      '    return files;',
      '  } finally { HTMLAnchorElement.prototype.click = click; }',
      '})()',
    ].join('\n')) as string[];
    expect(archiveFiles).toContain('interactions.ndjson');
    expect(archiveFiles.filter((name) => name.endsWith('.png'))).toHaveLength((await labels()).length);

    await report.setViewport({ width: 360, height: 640 });
    expect(await report.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    await report.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    const light = await report.evaluate('getComputedStyle(document.body).backgroundColor');
    await report.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    const dark = await report.evaluate('getComputedStyle(document.body).backgroundColor');
    expect(dark).not.toBe(light);

    await press('.open-report-button');
    await vi.waitFor(async () => {
      const openReports = await extension.worker.evaluate(
        (url) => chrome.tabs.query({}).then((tabs) => tabs.filter((tab) => tab.url === url).length),
        reportUrl,
      );
      expect(openReports).toBe(2);
    }, WAIT);

    await press('.secondary-button');
    await vi.waitFor(async () => expect(await panel.$('.record-button')).not.toBeNull(), WAIT);
    expect(await report.$('.report-head h1')).not.toBeNull();
    await panel.close();
  });

  it('explains when an in-memory report is unavailable', async () => {
    const url = await extension.worker.evaluate(async () => {
      const url = `${chrome.runtime.getURL('report.html')}?session=missing`;
      await chrome.tabs.create({ url });
      return url;
    });
    const report = await (await extension.browser.waitForTarget((target) => target.url() === url)).page();
    if (!report) throw new Error('Report tab did not open');
    await vi.waitFor(async () => expect(await report.$eval('[role="alert"]', (element) => element.textContent)).toContain('Recording unavailable'), WAIT);
  });

  // On `/still`: in this host the screencast never reports a still page's
  // scroll offset (Chrome 154), so only the page's own reports can show it.
  describe('video of each scroll', () => {
    it('makes none unless asked: no encoder document is opened', async () => {
      const tabId = await openTab(fixture.url('/still'));
      await record(tabId);
      await scrollOnce();

      expect(await hasEncoderDocument()).toBe(false);
      await stop();
      expect(await extension.worker.evaluate(() => recorder.clips.length)).toBe(0);
    });

    it('asked for, files the scroll\'s WebM under its 04 with its trace, and closes the encoder at Stop', async () => {
      const tabId = await openTab(fixture.url('/still'));
      await record(tabId, { video: true });
      expect(await hasEncoderDocument()).toBe(true);
      await scrollOnce();
      await stop();

      const result = await extension.worker.evaluate((pre, post) => {
        const frameOf = (label: string) => recorder.captures.find((c) => c.label === label)?.frame.index;
        return {
          clips: recorder.clips.map(({ viewId, label, mimeType, base64, trace }) => ({
            viewId,
            label,
            mimeType,
            magic: base64.slice(0, 5),
            trace: trace.map((s) => [s.frameIndex, s.atMs, s.y]),
          })),
          pre: frameOf(pre),
          post: frameOf(post),
        };
      }, preScroll, postScroll);

      expect(result.clips).toHaveLength(1);
      const [clip] = result.clips;
      expect(clip).toMatchObject({ label: postScroll, mimeType: 'video/webm', magic: 'GkXfo' }); // EBML
      // Every frame from the 03 to the 04, in order.
      const indices = clip?.trace.map(([index]) => index) ?? [];
      expect(indices[0]).toBe(result.pre);
      expect(indices.at(-1)).toBe(result.post);
      expect(indices).toEqual(indices.map((_, i) => (result.pre ?? NaN) + i));
      expect(clip?.trace.at(-1)?.[2]).toBe(600);
      expect(await hasEncoderDocument()).toBe(false);
    });

    it('plays in the panel: the toggle before Record, then a play button on the 04 row', async () => {
      await openTab(fixture.url('/still'));
      const panel = await extension.openPanel();
      const press = async (selector: string): Promise<void> => {
        await panel.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      };

      await vi.waitFor(async () => expect(await panel.$('.record-button')).not.toBeNull(), WAIT);
      await press('.option input');
      await press('.record-button');
      await waitForLabel(DocumentLabel.first);
      await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS * 2));
      await recordedTab.send('Runtime.evaluate', { expression: 'scrollTo(0, 600)' });
      await waitForLabel(postScroll);
      await press('.stop-button');
      await vi.waitFor(async () => expect(await panel.$('.capture-row__play')).not.toBeNull(), WAIT);

      const reportUrl = await extension.worker.evaluate(() => {
        if (recorder.status.state !== 'done' || !recorder.status.sessionId) throw new Error('No report session');
        return `${chrome.runtime.getURL('report.html')}?session=${encodeURIComponent(recorder.status.sessionId)}`;
      });
      const report = await (await extension.browser.waitForTarget((target) => target.url() === reportUrl)).page();
      if (!report) throw new Error('Report tab did not open');
      await vi.waitFor(async () => expect(await report.$('.report-capture__video')).not.toBeNull(), WAIT);

      // Chrome defers loading media in a background tab; the recording is over,
      // so the panel may come to the front, as when a person watches it.
      await panel.bringToFront();
      await press('.capture-row__play');
      const duration = await vi.waitFor(async () => {
        const seconds = await panel.$eval('.capture-row__video', (video) => (video as unknown as { duration: number }).duration);
        expect(seconds).toBeGreaterThan(0);
        return seconds;
      }, WAIT);
      const end = await extension.worker.evaluate(() => {
        const last = recorder.clips[0]?.trace.at(-1);
        return last ? (last.atMs + 250) / 1000 : NaN;
      });
      expect(duration).toBeCloseTo(end, 2);

      await press('.secondary-button');
      await panel.close();
    });
  });
});
