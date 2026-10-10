import { afterEach, expect, it, vi } from 'vitest';
import type { CdpTransport } from '@openuji/cdp';
import { DocumentLabel } from '@openuji/rules-document';
import { launchWithExtension, type ExtensionBrowser } from './extension-browser.js';
import { startFixtureServer, type FixtureServer } from './fixture.js';

const WAIT = { timeout: 15_000, interval: 50 };
const booking = 'https://raumbuchung.ub.fu-berlin.de/';
const identity = 'https://identity.fu-berlin.de/idp-fub/profile/SAML2/Redirect/SSO';
const login = `${identity};__Host-JSESSIONID=fixture-session?execution=fixture-flow`;
const safeLogin = `${identity};__Host-JSESSIONID=private?execution=private`;
let extension: ExtensionBrowser;
let fixture: FixtureServer;

afterEach(async () => { await extension?.close(); await fixture?.close(); });

it('uses the packaged FU profile through Record, navigation, Stop, and the saved report', async () => {
  fixture = await startFixtureServer();
  extension = await launchWithExtension();
  await extension.worker.evaluate(async (url) => {
    const tab = await chrome.tabs.create({ url });
    while ((await chrome.tabs.get(tab.id!)).status !== 'complete') await new Promise((resolve) => setTimeout(resolve, 25));
  }, fixture.url('/still'));
  const panel = await extension.openPanel();
  await panel.waitForSelector('.record-button');
  await panel.$eval('.record-button', (button) => (button as HTMLButtonElement).click());
  await vi.waitFor(async () => expect(await extension.worker.evaluate(() => recorder.status.state)).toBe('recording'), WAIT);

  // Exercise the real background/settings path, without replacing its Recorder or profile.
  // Every FU request is fulfilled locally; no account or university service is contacted.
  await extension.worker.evaluate(async () => {
    const cdp = recorder.cdp!;
    cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
      const url = new URL(request.url);
      const content = url.hostname.startsWith('identity.')
        ? '<form name="login"><input id="username" name="j_username" value="fixture-user" type="text"><button>Login</button></form>'
        : '<header class="banner"><div class="d-flex"><p class="pb-0 pr-2 h6 align-self-center font-weight-bold">Fixture Person (fixture-user)</p><a href="?page=logout">Abmelden</a></div></header>';
      const html = `<!doctype html><html><head><title>FU fixture</title><style>
        body { margin:20px; background:white; font:28px monospace; }
        p { margin:0; height:80px; } input { width:500px; height:60px; font:28px monospace; }
        button { display:block; } a { display:block; }
        </style></head><body>${content}<div style="margin-top:200px">${url.pathname === '/index.php' ? 'Index route' : 'Home route'}</div></body></html>`;
      void cdp.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], body: btoa(html) });
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  });
  const cdp = { send: ((method: string, params?: object) => extension.worker.evaluate(
    (method, params) => (recorder.cdp!.send as (method: string, params?: object) => Promise<unknown>)(method, params),
    method, params)) as CdpTransport['send'] };
  const read = async (expression: string) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const references: Record<string, { picture: string; width: number }> = {};

  for (const url of [booking, `${booking}index.php`, login]) {
    await cdp.send('Page.navigate', { url });
    await vi.waitFor(async () => expect(await read('location.href')).toBe(url), WAIT);
    await vi.waitFor(async () => expect(await read('document.readyState')).toBe('complete'), WAIT);
    if (url === login) {
      expect(await read('getComputedStyle(document.querySelector("#username")).webkitTextSecurity')).toBe('disc');
      expect(await read('document.querySelector("#username").value')).toBe('fixture-user');
    } else {
      expect(await read('document.querySelector("header p").textContent')).toBe('Don Joe (donjoe)');
      expect(await read('document.querySelector("header a").textContent')).toBe('Abmelden');
    }
    const savedUrl = url === login ? safeLogin : url;
    await vi.waitFor(async () => expect(await extension.worker.evaluate(() =>
      recorder.captures.map(({ url, label }) => ({ url, label })))).toContainEqual({ url: savedUrl, label: DocumentLabel.settled }), WAIT);
    references[savedUrl] = { picture: (await cdp.send('Page.captureScreenshot', { format: 'png' })).data,
      width: await read('innerWidth') as number };
  }

  // A second SSO step exercises the exact departing-page detail shown in the bug report.
  await cdp.send('Page.navigate', { url: `${identity};__Host-JSESSIONID=fixture-session?execution=fixture-next` });
  await vi.waitFor(async () => expect(await extension.worker.evaluate(() =>
    recorder.captures.some((capture) => capture.detail.includes('next URL is https://identity.')))).toBe(true), WAIT);
  await panel.$eval('.stop-button', (button) => (button as HTMLButtonElement).click());
  await vi.waitFor(async () => expect(await extension.worker.evaluate(() => recorder.status.state)).toBe('done'), WAIT);
  const captures = await extension.worker.evaluate(() => recorder.captures);
  expect(JSON.stringify(captures)).not.toMatch(/fixture-user|fixture-session|fixture-flow|fixture-next/);
  expect(captures.some((capture) => capture.detail.includes(`next URL is ${safeLogin}`))).toBe(true);

  const target = await extension.browser.waitForTarget((target) => target.url().includes('/report.html?session='));
  const report = (await target.page())!;
  await report.waitForSelector('.report-capture__detail');
  expect(await report.$eval('body', (body) => body.textContent)).not.toMatch(/fixture-user|fixture-session|fixture-flow|fixture-next/);
  expect(await report.$eval('body', (body) => body.textContent)).toContain(safeLogin);
  const reportPictures = await report.$$eval('.report-capture__image-link img', (images) => images.map((image) => (image as HTMLImageElement).src));

  // Check pixels delivered to the report, not only the live DOM or sanitizer output.
  for (const capture of captures.filter((capture) => references[capture.url])) {
    expect(reportPictures).toContain(`data:image/png;base64,${capture.frame.base64}`);
    const reference = references[capture.url]!;
    const error = await report.evaluate(async (actual, expected, width) => {
      const pixels = async (base64: string) => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const canvas = new OffscreenCanvas(520, 80); const context = canvas.getContext('2d')!;
        const scale = image.naturalWidth / width;
        context.drawImage(image, 20 * scale, 20 * scale, 520 * scale, 80 * scale, 0, 0, 520, 80);
        return context.getImageData(0, 0, 520, 80).data;
      };
      const [a, b] = await Promise.all([pixels(actual), pixels(expected)]);
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!);
      return sum / (a.length / 4);
    }, capture.frame.base64, reference.picture, reference.width);
    expect(error, `${capture.url} ${capture.label}`).toBeLessThan(1);
  }
});
