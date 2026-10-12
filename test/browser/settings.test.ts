import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchWithExtension, type ExtensionBrowser } from './extension-browser.js';

describe('extension privacy settings', () => {
  let extension: ExtensionBrowser;
  beforeAll(async () => { extension = await launchWithExtension({ inspectAllPages: true }); });
  afterEach(async () => { await extension.worker.evaluate(() => chrome.storage.local.remove('settings')); });
  afterAll(async () => { await extension?.close(); });

  it('opens Chrome Options, saves a validated selection across reloads, and restores defaults', async () => {
    const defaults = await extension.worker.evaluate(async () => {
      const defaults = await (await fetch(chrome.runtime.getURL('settings.defaults.json'))).json();
      await chrome.runtime.openOptionsPage();
      return defaults as { privacy: { profilePath: string } };
    });
    const target = await extension.browser.waitForTarget((target) => target.url().endsWith('/options.html'));
    const page = (await target.page())!;
    try {
      await page.waitForFunction(() => !(document.querySelector('#privacy-profile') as HTMLInputElement)?.disabled);
      expect(await page.$eval('#privacy-profile', (input) => (input as HTMLInputElement).value)).toBe(defaults.privacy.profilePath);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Saved.'));
      await page.reload();
      await page.waitForFunction(() => !(document.querySelector('#privacy-profile') as HTMLInputElement)?.disabled);
      expect(await page.$eval('#privacy-profile', (input) => (input as HTMLInputElement).value)).toBe(defaults.privacy.profilePath);
      await page.click('#privacy-profile', { count: 3 });
      await page.type('#privacy-profile', 'privacy/missing.jsonld');
      await page.click('button[type="submit"]');
      await page.waitForSelector('[role="alert"]');
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toEqual(defaults);
      await page.click('button[type="button"]');
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Defaults restored.'));
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toBeUndefined();
    } finally { await page.close(); }
  });

  it('stops before browser attachment when the selected document is unavailable', async () => {
    await extension.worker.evaluate(() => chrome.storage.local.set({ settings: { privacy: { profilePath: 'privacy/missing.jsonld' } } }));
    await expect(extension.worker.evaluate(async () => {
      await recorder.record({ id: 999999, windowId: 999999, title: 'Example', url: 'https://example.test/' });
    })).rejects.toThrow('The configured privacy profile could not be loaded.');
    expect(await extension.worker.evaluate(() => ({ status: recorder.status.state, attached: recorder.cdp !== null })))
      .toEqual({ status: 'idle', attached: false });
  });
});
