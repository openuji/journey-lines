import { cp, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'puppeteer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { twoRulePages } from '../../apps/extension/test/fixtures/privacy/two-rule-pages.js';
import { launchWithExtension, type ExtensionBrowser } from './extension-browser.js';

async function expectPage(page: Page, expectations: readonly {
  selector: string; textContent?: string; textSecurity?: string; value?: string;
}[]) {
  for (const { selector, ...properties } of expectations) {
    await vi.waitFor(async () => {
      const actual = await page.$eval(selector, (element) => ({
        textContent: element.textContent,
        textSecurity: getComputedStyle(element).getPropertyValue('-webkit-text-security'),
        ...(element instanceof HTMLInputElement ? { value: element.value } : {}),
      }));
      expect(actual).toMatchObject(properties);
    }, { timeout: 10_000, interval: 50 });
  }
}

describe('packaged privacy profile fixtures through the recorder', () => {
  let extension: ExtensionBrowser | undefined;
  let extensionPath: string | undefined;

  beforeEach(async () => {
    extensionPath = await mkdtemp(join(tmpdir(), 'privacy-profile-test-'));
    await cp(fileURLToPath(new URL('../../apps/extension/.output/chrome-mv3', import.meta.url)), extensionPath, { recursive: true });
    await mkdir(join(extensionPath, 'privacy/fixture'), { recursive: true });
    await copyFile(new URL('../../apps/extension/test/fixtures/privacy/two-rule-profile.jsonld', import.meta.url),
      join(extensionPath, 'privacy/fixture/profiles.jsonld'));
    extension = await launchWithExtension({ extensionPath, inspectAllPages: true });
    await extension.worker.evaluate(() => chrome.storage.local.set({
      settings: { privacy: { profilePath: 'privacy/fixture/profiles.jsonld' } },
    }));
  });

  afterEach(async () => {
    try { await extension?.close(); }
    finally { if (extensionPath) await rm(extensionPath, { recursive: true, force: true }); }
    extension = undefined;
    extensionPath = undefined;
  });

  // Both actions must work during recording and leave fresh idle pages alone.
  it.each([0, 1])('applies the selected profile only while recording, starting with fixture %i', async (startIndex) => {
    const page = await extension!.browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const fixture = twoRulePages.find((fixture) => fixture.url === request.url());
      // All requests are fulfilled locally, including unrelated asset requests.
      void request.respond({ status: fixture ? 200 : 404, contentType: 'text/html', body: fixture?.html ?? '' });
    });
    const pages = [...twoRulePages.slice(startIndex), ...twoRulePages.slice(0, startIndex)];
    await page.goto(pages[0]!.url, { waitUntil: 'domcontentloaded' });
    await expectPage(page, pages[0]!.idleExpectations);
    const panel = await extension!.openPanel();
    const recordButton = await panel.waitForSelector('button::-p-text(Record)');
    // The harness hosts the panel in a background tab. A DOM click invokes
    // its Record handler while keeping the fixture tab active, like a side panel.
    await recordButton!.evaluate((button) => button.click());

    for (const [index, fixture] of pages.entries()) {
      if (index) await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
      await expectPage(page, fixture.expectations);
    }
    const stopButton = await panel.waitForSelector('button::-p-text(Stop)');
    await stopButton!.evaluate((button) => button.click());
    const doneButton = await panel.waitForSelector('button::-p-text(Done)');
    await doneButton!.evaluate((button) => button.click());
    await panel.waitForSelector('button::-p-text(Record)');
    await page.bringToFront();
    for (const fixture of pages) {
      await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
      await expectPage(page, fixture.idleExpectations);
    }
  });
});
