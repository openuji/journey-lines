import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchWithExtension, type ExtensionBrowser } from './extension-browser.js';

describe('extension settings', () => {
  let extension: ExtensionBrowser;
  beforeAll(async () => {
    extension = await launchWithExtension({ inspectAllPages: true });
    // Keep a Chrome window available between tests that close their extension pages.
    await extension.browser.newPage();
  });
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
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#privacy-profile')?.disabled === false);
      expect(await page.$eval('#privacy-profile', (input) => (input as HTMLInputElement).value)).toBe(defaults.privacy.profilePath);
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Gespeichert.'));
      await page.reload();
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#privacy-profile')?.disabled === false);
      expect(await page.$eval('#privacy-profile', (input) => (input as HTMLInputElement).value)).toBe(defaults.privacy.profilePath);
      await page.click('#privacy-profile', { count: 3 });
      await page.type('#privacy-profile', 'privacy/missing.jsonld');
      await page.click('button[type="submit"]');
      await page.waitForSelector('[role="alert"]');
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toEqual(defaults);
      await page.click('button[type="button"]');
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Standardwerte wiederhergestellt.'));
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toBeUndefined();
    } finally { await page.close(); }
  });

  it('uses the saved language across extension pages only after opening or reloading', async () => {
    const options = await extension.browser.newPage();
    const report = await extension.browser.newPage();
    const panel = await extension.openPanel();
    const [optionsUrl, reportUrl] = await extension.worker.evaluate(() => [
      chrome.runtime.getURL('options.html'), chrome.runtime.getURL('report.html'),
    ]);
    try {
      await options.goto(optionsUrl!);
      await report.goto(reportUrl!);
      await panel.bringToFront();
      await panel.waitForSelector('button::-p-text(Aufnehmen)');
      await report.waitForSelector('[role="alert"]');
      await options.bringToFront();
      await options.waitForFunction(() => document.querySelector<HTMLSelectElement>('#extension-language')?.disabled === false);
      expect(await options.$eval('label[for="extension-language"]', (element) => element.textContent)).toBe('Sprache der Erweiterung');

      await options.select('#extension-language', 'en');
      await options.click('button[type="submit"]');
      await options.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Gespeichert.'));
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toMatchObject({ report: { language: 'en' } });
      for (const page of [options, panel, report]) {
        expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['de', 'ltr']);
      }
      expect(await panel.$eval('button', (element) => element.textContent)).toContain('Aufnehmen');
      expect(await report.$eval('[role="alert"]', (element) => element.textContent)).toBe('Keine Aufzeichnung angegeben.');

      await Promise.all([options.reload(), panel.reload(), report.reload()]);
      await options.waitForFunction(() => document.documentElement.lang === 'en');
      await options.waitForFunction(() => document.querySelector<HTMLSelectElement>('#extension-language')?.disabled === false);
      await panel.bringToFront();
      await panel.waitForSelector('button::-p-text(Record)');
      await report.bringToFront();
      await report.waitForFunction(() => document.documentElement.lang === 'en');
      expect(await options.$eval('label[for="extension-language"]', (element) => element.textContent)).toBe('Extension language');
      expect(await options.title()).toBe('OpenUJI Recorder settings');
      expect(await report.$eval('[role="alert"]', (element) => element.textContent)).toBe('No recording specified.');

      await options.bringToFront();
      await options.click('button[type="button"]');
      await options.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Defaults restored.'));
      expect(await options.evaluate(() => document.documentElement.lang)).toBe('en');
      await options.reload();
      await options.waitForFunction(() => document.documentElement.lang === 'de');
      expect(await options.title()).toBe('OpenUJI Recorder – Einstellungen');
    } finally { await Promise.allSettled([panel.close(), options.close(), report.close()]); }
  });

  it('stops before browser attachment when the selected document is unavailable', async () => {
    await extension.worker.evaluate(() => chrome.storage.local.set({ settings: { privacy: { profilePath: 'privacy/missing.jsonld' }, report: { language: 'de', tags: [] } } }));
    await expect(extension.worker.evaluate(async () => {
      await recorder.record({ id: 999999, windowId: 999999, title: 'Example', url: 'https://example.test/' });
    })).rejects.toThrow('The configured privacy profile could not be loaded.');
    expect(await extension.worker.evaluate(() => ({ status: recorder.status.state, attached: recorder.cdp !== null })))
      .toEqual({ status: 'idle', attached: false });
  });

  it('keeps Options in the saved language when recording settings are invalid', async () => {
    await extension.worker.evaluate(() => chrome.storage.local.set({
      settings: { privacy: null, report: { language: 'en', tags: null } },
    }));
    const page = await extension.browser.newPage();
    try {
      await page.goto(await extension.worker.evaluate(() => chrome.runtime.getURL('options.html')));
      await page.waitForSelector('[role="alert"]');
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
      expect(await page.$eval('[role="alert"]', (element) => element.textContent)).toContain('Settings could not be loaded.');
      expect(await page.$eval('#extension-language', (element) => (element as HTMLSelectElement).value)).toBe('en');
    } finally { await page.close(); }
  });
});
