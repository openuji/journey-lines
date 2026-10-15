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

  it('closes on the step it showed with one ring: the focus ring, then the viewed ring once the focus moves on', async () => {
    const page = await openViewer();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog:not([open])');
    const rings = () => page.evaluate(() => {
      const media = document.querySelector('[data-viewed] [class*="reader-step__media"]')!;
      const focused = media.querySelector(':focus-visible');
      return {
        focus: focused !== null && getComputedStyle(focused).outlineStyle !== 'none',
        viewed: getComputedStyle(media).outlineStyle !== 'none',
      };
    });
    expect(await rings()).toEqual({ focus: true, viewed: false });
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    expect(await rings()).toEqual({ focus: false, viewed: true });
    await page.close();
  });

  // 1440×900 leaves the screen as wide as the stage allows; 1600×760, as tall.
  it.each([[1440, 900], [1600, 760]])('keeps the screen, the way on, and the step in place on every step at %i×%i', async (width, height) => {
    const page = await openViewer(width, height);
    const boxes = () => page.evaluate(() => ['[class*="step-viewer__screen"]', 'section', 'button[aria-label="Nächster Schritt"]'].map((selector) => {
      const { x, y, width, height } = document.querySelector(`dialog ${selector}`)!.getBoundingClientRect();
      return { x, y, width, height };
    }));
    const { index: first, count } = await position(page);
    const shown = await boxes();
    for (let index = first; index < count; index++) {
      await page.keyboard.press('ArrowRight');
      expect(await boxes()).toEqual(shown);
    }
    await page.close();
  });
});
