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

  const record = (tabId: number): Promise<void> =>
    extension.worker.evaluate(async (tabId) => {
      const tab = await chrome.tabs.get(tabId);
      await recorder.record({ id: tabId, title: tab.title ?? '', url: tab.url ?? '' });
    }, tabId);

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
    await wheel(recordedTab, SCROLL_POINT.x, SCROLL_POINT.y, 600);
    // At scale factor 2 every frame would report 0. The command returns before
    // the page has scrolled, so wait for the frame that shows it.
    await vi.waitFor(
      async () => expect(await extension.worker.evaluate(() => frameScrollY)).toBe(600),
      WAIT,
    );

    // Scrolling captures nothing on its own; a click after it does, on frames
    // that carry where the page now is.
    await click(recordedTab, SCROLL_POINT.x, SCROLL_POINT.y);
    await waitForLabel(postClick);
    await stop();

    const clicked = await extension.worker.evaluate(
      (label) => recorder.captures.find((capture) => capture.label === label)?.frame.scrollY,
      postClick,
    );
    expect(clicked).toBe(600);
    expect(await scaleOfIdleTab(tabId)).toBe(2);
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

    await press('.secondary-button');
    await vi.waitFor(async () => expect(await panel.$('.record-button')).not.toBeNull(), WAIT);
    await panel.close();
  });
});
