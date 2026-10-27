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

  it('opens Options from the sidebar and persists validated click timings', async () => {
    const panel = await extension.openPanel();
    let options;
    try {
      await panel.bringToFront();
      await panel.waitForSelector('button[aria-label="Einstellungen"]');
      await panel.click('button[aria-label="Einstellungen"]');
      const target = await extension.browser.waitForTarget((target) => target.url().endsWith('/options.html'));
      options = (await target.page())!;
      await options.waitForFunction(() => document.querySelector<HTMLInputElement>('#click-quiet-seconds')?.disabled === false);
      expect(await options.$eval('#click-quiet-seconds', (input) => (input as HTMLInputElement).value)).toBe('0.25');
      expect(await options.$eval('#click-maximum-seconds', (input) => (input as HTMLInputElement).value)).toBe('2');
      for (const [id, value] of [['click-quiet-seconds', '1'], ['click-maximum-seconds', '5']]) {
        await options.click(`#${id}`, { count: 3 });
        await options.type(`#${id}`, value!);
      }
      await options.click('button[type="submit"]');
      await options.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Gespeichert.'));
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings))
        .toMatchObject({ click: { quietAfterMs: 1000, stillMovingMs: 5000 } });
      await options.reload();
      await options.waitForFunction(() => document.querySelector<HTMLInputElement>('#click-quiet-seconds')?.disabled === false);
      expect(await options.$eval('#click-maximum-seconds', (input) => (input as HTMLInputElement).value)).toBe('5');
      await options.click('#click-quiet-seconds', { count: 3 });
      await options.type('#click-quiet-seconds', '6');
      await options.click('button[type="submit"]');
      await options.waitForSelector('[role="alert"]');
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings))
        .toMatchObject({ click: { quietAfterMs: 1000, stillMovingMs: 5000 } });
      await options.click('button[type="button"]');
      await options.waitForFunction(() => document.querySelector<HTMLInputElement>('#click-quiet-seconds')?.value === '0.25');
      expect(await options.$eval('#click-maximum-seconds', (input) => (input as HTMLInputElement).value)).toBe('2');
    } finally { await panel.close(); await options?.close(); }
  });

  it('rejects invalid saved click timing before attaching to a tab', async () => {
    await extension.worker.evaluate(async () => {
      const defaults = await (await fetch(chrome.runtime.getURL('settings.defaults.json'))).json();
      await chrome.storage.local.set({ settings: { ...defaults, click: { quietAfterMs: 3000, stillMovingMs: 2000 } } });
    });
    await expect(extension.worker.evaluate(async () => {
      await recorder.record({ id: 999999, windowId: 999999, title: 'Example', url: 'https://example.test/' });
    })).rejects.toThrow('at least as long');
    expect(await extension.worker.evaluate(() => ({ status: recorder.status.state, attached: recorder.cdp !== null })))
      .toEqual({ status: 'idle', attached: false });
  });

  it('shows a dismissible error when the sidebar cannot open Options', async () => {
    const panel = await extension.openPanel();
    try {
      await panel.bringToFront();
      await panel.waitForSelector('button[aria-label="Einstellungen"]');
      await panel.evaluate(() => {
        chrome.runtime.openOptionsPage = async () => { throw new Error('Options unavailable'); };
      });
      await panel.click('button[aria-label="Einstellungen"]');
      await panel.waitForSelector('[role="alert"]');
      expect(await panel.$eval('[role="alert"]', (element) => element.textContent)).toContain('Options unavailable');
      await panel.click('button[aria-label="Schließen"]');
      await panel.waitForFunction(() => document.querySelector('[role="alert"]') === null);
    } finally { await panel.close(); }
  });

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
      expect(await page.$eval('#video-scale', (input) => (input as HTMLInputElement).value)).toBe('1');
      await page.click('#video-scale', { count: 3 });
      await page.type('#video-scale', '0.625');
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Gespeichert.'));
      await page.reload();
      await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#privacy-profile')?.disabled === false);
      expect(await page.$eval('#privacy-profile', (input) => (input as HTMLInputElement).value)).toBe(defaults.privacy.profilePath);
      expect(await page.$eval('#video-scale', (input) => (input as HTMLInputElement).value)).toBe('0.625');
      await page.click('#privacy-profile', { count: 3 });
      await page.type('#privacy-profile', 'privacy/missing.jsonld');
      await page.click('button[type="submit"]');
      await page.waitForSelector('[role="alert"]');
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toEqual({ ...defaults, video: { scale: 0.625 } });
      await page.click('button[type="button"]');
      await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Standardwerte wiederhergestellt.'));
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toBeUndefined();
      expect(await page.$eval('#video-scale', (input) => (input as HTMLInputElement).value)).toBe('1');
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
      expect(await options.$eval('label[for="video-scale"]', (element) => element.textContent)).toBe('Videoskalierung');
      expect(await options.$eval('#video-scale-help', (element) => element.textContent)).toContain('nächste Aufzeichnung');

      await options.select('#extension-language', 'en');
      await options.click('button[type="submit"]');
      await options.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.startsWith('Gespeichert.'));
      expect(await extension.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings)).toMatchObject({ report: { language: 'en' } });
      for (const page of [options, panel, report]) {
        expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['de', 'ltr']);
      }
      expect(await panel.$('button[aria-label="Einstellungen"]')).not.toBeNull();
      expect(await panel.$('button::-p-text(Aufnehmen)')).not.toBeNull();
      expect(await report.$eval('[role="alert"]', (element) => element.textContent)).toBe('Keine Aufzeichnung angegeben.');

      await Promise.all([options.reload(), panel.reload(), report.reload()]);
      await options.waitForFunction(() => document.documentElement.lang === 'en');
      await options.waitForFunction(() => document.querySelector<HTMLSelectElement>('#extension-language')?.disabled === false);
      await panel.bringToFront();
      await panel.waitForSelector('button::-p-text(Record)');
      await report.bringToFront();
      await report.waitForFunction(() => document.documentElement.lang === 'en');
      expect(await options.$eval('label[for="extension-language"]', (element) => element.textContent)).toBe('Extension language');
      expect(await options.$eval('label[for="video-scale"]', (element) => element.textContent)).toBe('Video scale');
      expect(await options.$eval('#video-scale-help', (element) => element.textContent)).toContain('next recording');
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
