import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePrivacy, privacyProfileFromDocument } from '@openuji/privacy';
import { PRIVACY_SOURCE } from '../../packages/privacy/src/generated/privacy-source.js';
import { PRIVACY_INSTALL } from '../../packages/privacy/src/constants.js';
import { privacyTextCases, privacyTextHtml } from './fixtures/privacy-text.js';

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
        ${privacyTextHtml}
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

  beforeEach(async () => {
    await worker.evaluate(() => chrome.storage.local.clear());
    await page.bringToFront();
    await page.goto(fixtureUrl);
  });

  async function exportDocument(): Promise<Record<string, unknown>> {
    const popup = await browser.newPage();
    try {
      await popup.goto(await worker.evaluate(() => chrome.runtime.getURL('popup.html')));
      const reply = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'collector:export' })) as
        { ok: true; json: string } | { ok: false; error: string };
      if (!reply.ok) throw new Error(reply.error);
      return JSON.parse(reply.json) as Record<string, unknown>;
    } finally { await popup.close(); }
  }

  async function clickText(selector: string, text: string): Promise<number> {
    text = text.trim();
    const { x, y, index } = await page.$eval(selector, (element, text) => {
      element.scrollIntoView({ block: 'center' });
      const index = Array.from(element.childNodes).findIndex((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === text);
      if (index < 0) throw new Error('Fixture text is missing.');
      const node = element.childNodes[index]!;
      const range = document.createRange();
      const start = node.textContent!.indexOf(text);
      range.setStart(node, start); range.setEnd(node, start + 1);
      const rect = range.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, index };
    }, text);
    await page.mouse.click(x, y);
    return index;
  }

  async function textDestination(): Promise<string> {
    return page.evaluate(() => {
      const root = document.querySelector('[data-openuji-privacy-collector]')!.shadowRoot!;
      return (root.getElementById('text-target') as HTMLSelectElement).value;
    });
  }

  async function saveCurrentSelection(): Promise<void> {
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-openuji-privacy-collector]')?.shadowRoot;
      return root && !(root.getElementById('save') as HTMLButtonElement).disabled;
    });
    await page.evaluate(() => {
      const root = document.querySelector('[data-openuji-privacy-collector]')!.shadowRoot!;
      (root.getElementById('editor') as HTMLFormElement).requestSubmit();
    });
    await page.waitForFunction(() => !document.querySelector('[data-openuji-privacy-collector]'));
  }

  async function startPicker(): Promise<void> {
    const popupUrl = await worker.evaluate(() => chrome.runtime.getURL('popup.html'));
    const existingTargets = new Set(browser.targets());
    // Native window focus can settle after windows.update resolves on macOS.
    await vi.waitFor(() => worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url)!;
      await chrome.tabs.update(tab.id!, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.action.openPopup({ windowId: tab.windowId });
    }, fixtureUrl), { timeout: 7_000, interval: 100 });
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
    await popup.close();
  });

  it('keeps a manually selected text part when editing and exporting the rule', async () => {
    const fixture = privacyTextCases[0];
    await startPicker();
    await clickText(fixture.selector, 'Herrn');
    const nameIndex = await page.$eval(fixture.selector, (element, text) =>
      Array.from(element.childNodes).findIndex((node) => node.textContent?.trim() === text), fixture.original);
    await setShadowValue(page, 'text-target', String(nameIndex));
    expect(await textDestination()).toBe(String(nameIndex));
    await setShadowValue(page, 'replacement', fixture.replacement);
    await setShadowValue(page, 'scope', 'origin');
    await setShadowValue(page, 'slot', 'recipient-name');
    expect(await textDestination()).toBe(String(nameIndex));
    await saveCurrentSelection();

    const profile = privacyProfileFromDocument(await exportDocument());
    expect(profile.rules).toHaveLength(1);
    expect(profile.rules[0]).toMatchObject({ replacement: fixture.replacement, text: { kind: 'direct-text', childNodeIndex: nameIndex } });
  });

  it('collects individual lines and a greeting, preserving every rule and the surrounding document', async () => {
    const selectors = [...new Set(privacyTextCases.map((fixture) => fixture.selector))];
    const markup = async () => Promise.all(selectors.map((selector) => page.$eval(selector, (element) => element.outerHTML)));
    const before = await markup();
    for (const fixture of privacyTextCases) {
      await startPicker();
      const index = await clickText(fixture.selector, fixture.original);
      expect(await textDestination()).toBe(String(index));
      await setShadowValue(page, 'replacement', fixture.replacement);
      expect(await textDestination()).toBe(String(index));
      await saveCurrentSelection();
    }
    expect(await markup()).toEqual(before);
    const document = await exportDocument();
    const profile = privacyProfileFromDocument(document);
    expect(profile.rules).toHaveLength(privacyTextCases.length);
    expect(new Set(profile.rules.map((rule) => rule.id)).size).toBe(privacyTextCases.length);
    for (const fixture of privacyTextCases) expect(JSON.stringify(document)).not.toContain(fixture.original.trim());

    // Exercise exported rules through the same browser runtime used by recordings.
    await page.evaluate(`${PRIVACY_SOURCE}\n;globalThis.${PRIVACY_INSTALL}(${JSON.stringify(compilePrivacy(profile))})`);
    const expected = before.map((html, index) => privacyTextCases
      .filter((fixture) => fixture.selector === selectors[index])
      .reduce((result, fixture) => result.replace(fixture.original, fixture.replacement), html));
    expect(await markup()).toEqual(expected);
  });

  it('suggests a new ID when collecting the same node again and rejects an existing ID', async () => {
    const fixture = privacyTextCases[0];
    await startPicker();
    await clickText(fixture.selector, fixture.original);
    await setShadowValue(page, 'replacement', fixture.replacement);
    const originalId = await page.evaluate(() => (document.querySelector('[data-openuji-privacy-collector]')!
      .shadowRoot!.getElementById('slot') as HTMLInputElement).value);
    await saveCurrentSelection();

    await startPicker();
    await clickText(fixture.selector, fixture.original);
    const suggestedId = await page.evaluate(() => (document.querySelector('[data-openuji-privacy-collector]')!
      .shadowRoot!.getElementById('slot') as HTMLInputElement).value);
    expect(suggestedId).not.toBe(originalId);
    await setShadowValue(page, 'replacement', 'Another alias');
    await setShadowValue(page, 'slot', originalId);
    expect(await page.evaluate(() => {
      const root = document.querySelector('[data-openuji-privacy-collector]')!.shadowRoot!;
      return { disabled: (root.getElementById('save') as HTMLButtonElement).disabled,
        message: root.querySelector('[role="alert"]')!.textContent };
    })).toMatchObject({ disabled: true, message: expect.stringContaining('already exists') });
    await page.keyboard.press('Escape');
    const profile = privacyProfileFromDocument(await exportDocument());
    expect(profile.rules).toHaveLength(1);
    expect(profile.rules[0]).toMatchObject({ replacement: fixture.replacement });
  });
});
