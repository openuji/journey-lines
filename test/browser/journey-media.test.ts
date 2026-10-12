import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { build } from 'esbuild';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { workspaceAliases } from '../../workspace-aliases';

declare global {
  interface Window { mediaUrls: { created: string[]; revoked: string[] } }
}

const CLICK_ROW = 'li[data-tone="click"]';
const FILMSTRIP_FRAME = `${CLICK_ROW} [data-frame-index]`;
const WAIT = { timeout: 10_000, interval: 25 };

describe('journey transition media in a browser', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // Bundle the actual components with their styles; no Storybook server or
    // extension transport is needed to test the presentation boundary.
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('../../apps/extension/test/browser/journey-media-app.tsx', import.meta.url))],
      outfile: 'journey-media.js', write: false, bundle: true,
      platform: 'browser', format: 'iife', jsx: 'automatic', alias: workspaceAliases,
    });
    const assets = Object.fromEntries(bundle.outputFiles!.map((file) => [basename(file.path), file.text]));
    server = createServer((request, response) => {
      const path = request.url?.slice(1) ?? '';
      if (!path) {
        response.setHeader('content-type', 'text/html');
        response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/journey-media.css"></head><body><div id="root"></div><script src="/journey-media.js"></script></body></html>');
        return;
      }
      response.setHeader('content-type', path.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(assets[path]);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fixture server address');
    url = `http://127.0.0.1:${address.port}/`;
    browser = await puppeteer.launch({ headless: true, ...(process.env['UXR_CHROME_EXECUTABLE'] ? { executablePath: process.env['UXR_CHROME_EXECUTABLE'] } : {}) });
    page = await browser.newPage();
    page.on('pageerror', (error) => console.error('[media fixture]', String(error)));
    await page.evaluateOnNewDocument(() => {
      window.mediaUrls = { created: [], revoked: [] };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const result = create(blob);
        window.mediaUrls.created.push(result);
        return result;
      };
      URL.revokeObjectURL = (value) => { window.mediaUrls.revoked.push(value); revoke(value); };
    });
  });

  beforeEach(async () => {
    await page.setViewport({ width: 320, height: 800 });
    await page.goto(url);
    await page.waitForSelector(FILMSTRIP_FRAME);
    await page.$eval('.journey', (element) => { element.scrollTop = 0; });
    await vi.waitFor(async () => expect(await page.$eval('.journey', (element) => element.scrollTop)).toBe(0), WAIT);
    // Finish the initial live-follow scroll before opening a preview. A queued
    // scroll event correctly dismisses a popup, even if its DOM offset is 0.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  });

  afterAll(async () => {
    await browser?.close();
    server?.closeAllConnections();
    await new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve());
  });

  afterEach(async ({ task }) => {
    if (task.result?.state === 'fail') await page.screenshot({ path: '/tmp/journey-stage2-failed.png' });
  });

  const expectColor = async (channel: number): Promise<void> => {
    await vi.waitFor(async () => {
      const result = await page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>('[role="tooltip"] video');
        if (!video || video.parentElement?.querySelector('[role="status"]')) {
          const pending = document.querySelector<HTMLVideoElement>('[role="tooltip"] video');
          return { pixels: [], paused: pending?.paused, diagnostic: {
            preview: document.querySelector('[role="tooltip"]')?.textContent,
            className: pending?.parentElement?.className,
            readyState: pending?.readyState, seeking: pending?.seeking, time: pending?.currentTime, duration: pending?.duration,
            error: pending?.error?.message,
          } };
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d')!;
        context.drawImage(video, 0, 0);
        return { pixels: [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data], paused: video.paused };
      });
      expect(result?.pixels[channel] ?? -1, JSON.stringify(result)).toBeGreaterThan(220);
      for (const other of [0, 1, 2].filter((value) => value !== channel)) expect(result?.pixels[other]).toBeLessThan(30);
      expect(result?.paused).toBe(true);
    }, WAIT);
  };

  it('steps through sampled frames with keyboard controls and dismisses the preview on Escape', async () => {
    expect(await page.$('input[type="range"]')).toBeNull();
    expect(await page.$$eval(FILMSTRIP_FRAME, (frames) => frames.map((frame) => frame.getAttribute('data-frame-index')))).toEqual(['0', '1', '2']);
    await page.focus(`${FILMSTRIP_FRAME}[data-frame-index="0"]`);
    await expectColor(0);
    await page.keyboard.press('ArrowRight');
    await expectColor(1);
    expect(await page.$eval(':focus', (element) => element.getAttribute('aria-label'))).toContain('frame 2 of 3');
    await page.keyboard.press('End');
    await expectColor(2);
    await page.keyboard.press('Home');
    await expectColor(0);
    await page.keyboard.press('Escape');
    expect(await page.$('[role="tooltip"]')).toBeNull();
  });

  it.each([320, 480])('shows distinct shared-source frame previews without moving the %i px timeline or changing endpoints', async (width) => {
    await page.setViewport({ width, height: 800 });
    const endpoints = await page.$eval(CLICK_ROW, (row) => Array.from(row.querySelectorAll('img'), (image) => image.getAttribute('src')));
    const initialScroll = await page.$eval('.journey', (element) => element.scrollTop);
    await page.hover(`${FILMSTRIP_FRAME}[data-frame-index="1"]`);
    await expectColor(1);
    await page.hover(`${FILMSTRIP_FRAME}[data-frame-index="2"]`);
    await expectColor(2);
    const bounds = await page.$eval('[role="tooltip"]', (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, outsideJourney: !element.closest('.journey') };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(8);
    expect(bounds.right).toBeLessThanOrEqual(width - 8);
    expect(bounds.top).toBeGreaterThanOrEqual(8);
    expect(bounds.bottom).toBeLessThanOrEqual(792);
    expect(bounds.outsideJourney).toBe(true);
    await page.screenshot({ path: `/tmp/journey-stage2-${width}.png` });
    await page.hover(`${FILMSTRIP_FRAME}[data-frame-index="0"]`);
    await expectColor(0);
    await page.hover(`${FILMSTRIP_FRAME}[data-frame-index="1"]`);
    await expectColor(1);
    expect(await page.$eval('.journey', (element) => element.scrollTop)).toBe(initialScroll);
    expect(await page.$eval(CLICK_ROW, (row) => Array.from(row.querySelectorAll('img'), (image) => image.getAttribute('src')))).toEqual(endpoints);
    expect(await page.$eval(CLICK_ROW, (row) => new Set(Array.from(row.querySelectorAll<HTMLVideoElement>('[data-frame-index] video'), (video) => video.src)).size)).toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    await page.mouse.move(1, 1);
    expect(await page.$('[role="tooltip"]')).toBeNull();
  });

  it('keeps incomplete events passive, expands one endpoint, and discloses playback below the filmstrip', async () => {
    const incomplete = 'li[data-tone]:nth-child(4)';
    expect(await page.$(`${incomplete} [aria-label="Before frame unavailable"]`)).not.toBeNull();
    expect(await page.$(`${incomplete} [aria-label="Recorded transition frames"]`)).toBeNull();
    expect(await page.$(`${incomplete} [aria-label="Play video"]`)).toBeNull();
    await page.click(`${CLICK_ROW} [aria-label="Expand before frame"]`);
    await page.click(`${CLICK_ROW} [aria-label="Expand after frame"]`);
    expect(await page.$$('img[alt="After frame"]')).toHaveLength(1);
    await page.click(`${CLICK_ROW} [aria-label="Collapse after frame"]`);
    await page.hover(`${FILMSTRIP_FRAME}[data-frame-index="1"]`);
    await expectColor(1);

    const playButton = `${CLICK_ROW} [aria-label="Play video"]`;
    const filmstripBottom = await page.$eval(`${CLICK_ROW} [aria-label="Recorded transition frames"]`, (element) => element.getBoundingClientRect().bottom);
    const controlsTop = await page.$eval(playButton, (element) => element.parentElement!.getBoundingClientRect().top);
    expect(controlsTop).toBeGreaterThanOrEqual(filmstripBottom);
    expect(await page.$eval(playButton, (element) => element.parentElement!.textContent)).toContain('0.60 s');

    await page.click(playButton);
    expect(await page.$('[role="tooltip"]')).toBeNull();
    expect(await page.$(`${CLICK_ROW} [aria-label="Hide video"] svg.lucide-x`)).not.toBeNull();
    expect(await page.$$eval(FILMSTRIP_FRAME, (frames) => frames.every((frame) => (frame as HTMLButtonElement).disabled))).toBe(true);
    await page.waitForSelector('video[controls]');
    await vi.waitFor(async () => expect(await page.$eval('video[controls]', (element) => (element as HTMLVideoElement).duration)).toBeGreaterThan(0), WAIT);
    const playerSource = await page.$eval('video[controls]', (element) => (element as HTMLVideoElement).src);
    const controlsBottom = await page.$eval(`${CLICK_ROW} [aria-label="Hide video"]`, (element) => element.parentElement!.getBoundingClientRect().bottom);
    const playerTop = await page.$eval('video[controls]', (element) => element.getBoundingClientRect().top);
    expect(playerTop).toBeGreaterThanOrEqual(controlsBottom);
    await page.$eval('video[controls]', (element) => {
      const video = element as HTMLVideoElement;
      video.pause();
      video.currentTime = Math.min(0.55, video.duration);
    });

    await page.click(`${CLICK_ROW} [aria-label="Hide video"]`);
    expect(await page.$('video[controls]')).toBeNull();
    await vi.waitFor(async () => {
      const urls = await page.evaluate(() => window.mediaUrls);
      expect(urls.revoked).toContain(playerSource);
    }, WAIT);
    expect(await page.$$eval(FILMSTRIP_FRAME, (frames) => frames.every((frame) => !(frame as HTMLButtonElement).disabled))).toBe(true);

    await page.click(playButton);
    await page.waitForSelector('video[controls]');
    expect(await page.$eval('video[controls]', (element) => (element as HTMLVideoElement).currentTime)).toBeLessThan(0.25);
    await page.click(`${CLICK_ROW} [aria-label="Hide video"]`);
  });

  it('retains live follow until the person scrolls away', async () => {
    await page.click('#append');
    expect(await page.$eval('.journey', (element) => element.scrollTop)).toBe(0);
    await page.$eval('.journey', (element) => { element.scrollTop = element.scrollHeight; });
    await page.click('#append');
    await vi.waitFor(async () => expect(await page.$eval('.journey', (element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(1), WAIT);
  });
});
