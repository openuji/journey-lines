import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { privacyProfileFromDocument } from '@openuji/privacy';

const EXTENSION = fileURLToPath(
  new URL('../../apps/privacy-collector/.output/chrome-mv3', import.meta.url),
);
const PRIVATE_NAME = 'Fixture Real Person';
const PRIVATE_USERNAME = 'fixture-secret-user';
const PRIVATE_SESSION = 'PRIVATESESSION123';

async function setShadowValue(page: Page, id: string, value: string): Promise<void> {
  await page.evaluate(({ id, value }) => {
    const root = document.querySelector<HTMLElement>('[data-openuji-privacy-collector]')?.shadowRoot;
    const control = root?.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!control) throw new Error(`Collector control ${id} is missing.`);
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
}

describe('privacy selector collector extension', () => {
  let browser: Browser;
  let worker: WebWorker;
  let page: Page;
  let fixtureUrl: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`<!doctype html><html><body>
        <header><p id="account">${PRIVATE_NAME}</p></header>
        <form name="login"><input id="username" name="j_username" value="${PRIVATE_USERNAME}"></form>
      </body></html>`);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    closeServer = () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1100, height: 800 },
      enableExtensions: [EXTENSION],
      waitForInitialPage: false,
    });
    const workerTarget = await browser.waitForTarget((target) =>
      target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'));
    const foundWorker = await workerTarget.worker();
    if (!foundWorker) throw new Error('Privacy collector service worker did not start.');
    worker = foundWorker;
    fixtureUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/private/path;__Host-JSESSIONID=${PRIVATE_SESSION}?execution=e1s2`;
    page = await browser.newPage();
    await page.goto(fixtureUrl);
  });

  afterAll(async () => {
    await browser?.close();
    await closeServer?.();
  });

  async function startPicker(): Promise<void> {
    const popupUrl = await worker.evaluate(() => chrome.runtime.getURL('popup.html'));
    const existingTargets = new Set(browser.targets());
    await worker.evaluate(() => chrome.action.openPopup());
    const target = await browser.waitForTarget(
      (candidate) => candidate.url() === popupUrl && !existingTargets.has(candidate), { timeout: 7_000 },
    );
    const popup = await target.asPage();
    await popup.waitForFunction(() => (document.querySelector('#tenant') as HTMLInputElement)?.value !== '', {
      timeout: 7_000,
    });
    await popup.$eval('#tenant', (input) => {
      (input as HTMLInputElement).value = 'fu';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await popup.click('#pick');
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!popup.isClosed()) {
      const popupStatus = await popup.$eval('#status', (element) => element.textContent);
      if (popupStatus) throw new Error(`Collector popup error: ${popupStatus}`);
    }
    const fixtureTarget = await browser.waitForTarget((candidate) => candidate.url() === fixtureUrl, { timeout: 7_000 });
    const currentPage = await fixtureTarget.page();
    if (!currentPage) throw new Error('Fixture page was not available after the picker started.');
    page = currentPage;
    await page.waitForSelector('[data-openuji-privacy-collector]', { timeout: 7_000 });
  }

  async function saveSelection(targetSelector: string, slotId: string, replacement?: string): Promise<void> {
    await page.click(targetSelector);
    await page.waitForFunction(() => {
      const root = document.querySelector<HTMLElement>('[data-openuji-privacy-collector]')?.shadowRoot;
      return root && !(root.getElementById('editor') as HTMLFormElement).hidden;
    }, { timeout: 7_000 });
    await setShadowValue(page, 'slot', slotId);
    if (replacement !== undefined) await setShadowValue(page, 'replacement', replacement);
    await page.waitForFunction(() => {
      const root = document.querySelector<HTMLElement>('[data-openuji-privacy-collector]')?.shadowRoot;
      return !(root?.getElementById('save') as HTMLButtonElement | undefined)?.disabled;
    }, { timeout: 7_000 });
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-openuji-privacy-collector]')?.shadowRoot;
      (root?.getElementById('editor') as HTMLFormElement).requestSubmit();
    });
    await page.waitForFunction(() => !document.querySelector('[data-openuji-privacy-collector]'), { timeout: 7_000 });
  }

  it('collects text and input selectors and exports no observed private values', async () => {
    await startPicker();
    await saveSelection('#account', 'booking.account', 'Don Joe (donjoe)');

    await startPicker();
    await saveSelection('#username', 'identity.username');

    const popupUrl = await worker.evaluate(() => chrome.runtime.getURL('popup.html'));
    const existingTargets = new Set(browser.targets());
    await worker.evaluate((url) => chrome.tabs.create({ url, active: false }), popupUrl);
    const popupTarget = await browser.waitForTarget(
      (candidate) => candidate.url() === popupUrl && !existingTargets.has(candidate), { timeout: 7_000 },
    );
    const popup = await popupTarget.page();
    if (!popup) throw new Error('Collector export page did not open.');
    await popup.waitForFunction(() => (document.querySelector('#tenant') as HTMLInputElement)?.value !== '', {
      timeout: 7_000,
    });
    expect(await popup.$eval('#count', (element) => element.textContent)).toBe('2');
    const reply = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'collector:export' })) as
      { ok: true; json: string } | { ok: false; error: string };
    expect(reply.ok).toBe(true);
    if (!reply.ok) throw new Error(reply.error);

    expect(reply.json).not.toContain(PRIVATE_NAME);
    expect(reply.json).not.toContain(PRIVATE_USERNAME);
    expect(reply.json).not.toContain(PRIVATE_SESSION);
    expect(reply.json).not.toContain('execution=e1s2');
    const exportedDocument = JSON.parse(reply.json) as Record<string, unknown>;
    const profile = privacyProfileFromDocument(exportedDocument);
    expect(profile.rules.map((rule) => ({ id: rule.id, action: rule.action }))).toEqual([
      { id: 'fu.booking.account', action: 'replace-text' },
      { id: 'fu.identity.username', action: 'mask-input' },
    ]);
    expect(profile.catalog['@graph']).toEqual(expect.arrayContaining([
      expect.objectContaining({ '@type': 'CustomLocator' }),
    ]));
  });
});
