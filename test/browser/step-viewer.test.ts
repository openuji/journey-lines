import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workspaceAliases } from '../../workspace-aliases';

describe('the reader’s step viewer in a browser', () => {
  let browser: Browser;
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // The published reader as the journeys site mounts it: German, on the campus report.
    const bundle = await build({
      stdin: {
        contents: `
          import { createElement } from 'react';
          import { createRoot } from 'react-dom/client';
          import { journeyEntry } from '@openuji/journey';
          import { campusReport } from '@openuji/journey/fixtures';
          import { ReportReader } from './src/ui/ReportReader/ReportReader';
          import { storyMedia } from './src/stories/media';
          import './src/styles/styles.css';
          createRoot(document.getElementById('root')).render(createElement(ReportReader, {
            entry: journeyEntry(campusReport), media: storyMedia(campusReport), locale: { language: 'de', dir: 'ltr' },
          }));
        `,
        resolveDir: fileURLToPath(new URL('../../packages/design-system/', import.meta.url)),
        loader: 'tsx',
      },
      alias: workspaceAliases,
      bundle: true,
      format: 'iife',
      outfile: 'reader.js',
      write: false,
      jsx: 'automatic',
    });
    const script = bundle.outputFiles!.find((file) => file.path.endsWith('.js'))!.text;
    const css = bundle.outputFiles!.find((file) => file.path.endsWith('.css'))!.text;
    server = createServer((request, response) => {
      if (request.url === '/reader.js') {
        response.writeHead(200, { 'content-type': 'text/javascript' });
        response.end(script);
      } else if (request.url === '/reader.css') {
        response.writeHead(200, { 'content-type': 'text/css' });
        response.end(css);
      } else {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html data-color-mode="light"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/reader.css"></head><body><div id="root"></div><script src="/reader.js"></script></body></html>');
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    browser = await puppeteer.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  });

  /** The reader with its first picture opened in the viewer. */
  async function openViewer(width = 1440, height = 900): Promise<Page> {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url);
    await page.click('button[aria-controls^="step-viewer-"]');
    await page.waitForSelector('dialog[open]');
    return page;
  }

  const position = (page: Page) => page.$eval('dialog [class*="step-viewer__position"]', (element) => {
    const [, index, count] = /(\d+) von (\d+)/.exec(element.textContent ?? '') ?? [];
    return { index: Number(index), count: Number(count) };
  });

  it('steps with the arrows from wherever the focus is: the clip, or a view button the next step does not have', async () => {
    const page = await openViewer();
    const { index: first, count } = await position(page);
    for (let index = first; index < count; index++) {
      await page.evaluate(() => document.querySelector<HTMLElement>('dialog video, dialog [aria-pressed]')?.focus());
      await page.keyboard.press('ArrowRight');
      expect((await position(page)).index).toBe(index + 1);
    }
    for (let index = count; index > first; index--) {
      await page.evaluate(() => document.querySelector<HTMLElement>('dialog video, dialog [aria-pressed]')?.focus());
      await page.keyboard.press('ArrowLeft');
      expect((await position(page)).index).toBe(index - 1);
    }
    await page.close();
  });

  /** Which ring the step the viewer showed last has: the focused picture's own, or its pictures' together. */
  const rings = (page: Page) => page.evaluate(() => {
    const media = document.querySelector('[data-viewed] [class*="reader-step__media"]')!;
    const focused = media.querySelector(':focus-visible');
    return {
      focus: focused !== null && getComputedStyle(focused).outlineStyle !== 'none',
      viewed: getComputedStyle(media).outlineStyle !== 'none',
    };
  });

  it('closes by key on the step it showed with the focus ring alone, gone once the focus moves on', async () => {
    const page = await openViewer();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.closest('[data-viewed]'));
    expect(await rings(page)).toEqual({ focus: true, viewed: false });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    expect(await rings(page)).toEqual({ focus: false, viewed: false });
    await page.close();
  });

  it('closes by pointer on the step it showed with its pictures ringed while they hold the focus, and no longer', async () => {
    const page = await openViewer();
    await page.keyboard.press('ArrowRight');
    await page.click('dialog button[aria-label="Schließen"]');
    await page.waitForFunction(() => document.activeElement?.closest('[data-viewed]'));
    expect(await rings(page)).toEqual({ focus: false, viewed: true });
    await page.mouse.click(5, 5);
    expect(await rings(page)).toEqual({ focus: false, viewed: false });
    await page.close();
  });

  const boxes = (page: Page) => page.evaluate(() => ['[class*="step-viewer__screen"]', 'section', 'button[aria-label="Nächster Schritt"]'].map((selector) => {
    const { x, y, width, height } = document.querySelector(`dialog ${selector}`)!.getBoundingClientRect();
    return { x, y, width, height };
  }));

  /** How many lines the labels of what was written about the phase take; none before any phase. */
  const headline = (page: Page) => page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('dialog [class*="statement-tabs__tab"]'));
    return labels.length > 0 ? new Set(labels.map((label) => label.getBoundingClientRect().bottom)).size : null;
  });

  // 1440×900 leaves the screen as wide as the stage allows; 1600×760, as tall.
  it.each([[1440, 900], [1600, 760]])('keeps the screen, the way on, and the step in place on every step at %i×%i', async (width, height) => {
    const page = await openViewer(width, height);
    const { index: first, count } = await position(page);
    const shown = await boxes(page);
    const lines = [await headline(page)];
    for (let index = first; index < count; index++) {
      await page.keyboard.press('ArrowRight');
      expect(await boxes(page)).toEqual(shown);
      lines.push(await headline(page));
    }
    const told = lines.filter((line) => line !== null);
    expect(told.length).toBeGreaterThan(0);
    expect(told.every((line) => line === 1)).toBe(true);
    await page.close();
  });

  it('shows what was written about the phase over the screen from the label pointed at, hands over to its neighbour, and moves nothing', async () => {
    const page = await openViewer();
    while ((await page.$$('dialog [class*="statement-tabs__tab"]')).length < 2) await page.keyboard.press('ArrowRight');
    const panels = 'dialog [role="tooltip"]';
    const closed = () => page.waitForFunction((panels) => Array.from(document.querySelectorAll(panels)).every((panel) => getComputedStyle(panel).visibility === 'hidden'), {}, panels);
    // Which panel is on top of everything else: the one pointed at, joined to its tab, and over the screen.
    const onTop = () => page.evaluate((panels) => Array.from(document.querySelectorAll(panels)).flatMap((panel, index) => {
      const { left, top, width, height } = panel.getBoundingClientRect();
      const tab = panel.previousElementSibling!.getBoundingClientRect();
      const hit = document.elementFromPoint(left + width / 2, top + height / 2);
      return panel.contains(hit) ? [{ index, joined: tab.bottom > top && tab.left >= left && tab.right <= left + width }] : [];
    }), panels);
    // Away from where the picture was clicked to open the viewer.
    await page.mouse.move(5, 5);
    await closed();
    const shown = await boxes(page);
    const [first, second] = await page.$$('dialog [class*="statement-tabs__tab"]');
    await second!.hover();
    await page.waitForFunction((panels) => getComputedStyle(document.querySelectorAll(panels)[1]!).opacity === '1', {}, panels);
    expect(await onTop()).toEqual([{ index: 1, joined: true }]);
    await first!.hover();
    await page.waitForFunction((panels) => getComputedStyle(document.querySelectorAll(panels)[1]!).visibility === 'hidden', {}, panels);
    expect(await onTop()).toEqual([{ index: 0, joined: true }]);
    expect(await boxes(page)).toEqual(shown);
    await page.mouse.move(5, 5);
    await closed();
    await page.close();
  });
});
