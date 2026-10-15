import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getJourneyTemplate, readReportArtifacts, unzipStored } from '@journey-lines/journey';
import { storyReportWithClip } from '@journey-lines/journey/fixtures';
import type { ReportSettings } from '../../apps/extension/src/lib/settings';
import type { ReportRequest, ReportResponse } from '../../apps/extension/src/lib/report-protocol';
import type { WorkerMessage } from '../../apps/extension/src/lib/protocol';
import { donePanelState, recordingPanelState } from '../../apps/extension/src/stories/panel-states';
import { workspaceAliases } from '../../workspace-aliases';

declare global {
  interface Window {
    renderTranslationScope(language: string): void;
    reportLocalisationTest: {
      resolveSettings(report: ReportSettings): void;
      panelMessage(message: WorkerMessage): void;
      panelConnections: number;
      download: Blob | null;
    };
  }
}

describe('extension localisation adapters and independent readers', () => {
  let browser: Browser;
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // Mount the production adapter. Only Chrome's storage and recording port are substituted.
    const bundle = await build({
      stdin: {
        contents: `
          import { createElement } from 'react';
          import { createRoot } from 'react-dom/client';
          import { Report } from './src/entrypoints/report/Report';
          import { App } from './src/entrypoints/sidepanel/App';
          import { TranslationProvider, useTranslation, FrameThumbnail } from '@journey-lines/design-system';
          import readerMeta, { German, EnglishRtl } from '../../packages/design-system/src/ui/ReportReader/ReportReader.stories';
          import '@journey-lines/design-system/styles.css';
          const stories = { German, EnglishRtl };
          const story = stories[new URLSearchParams(location.search).get('story')];
          const view = story
            ? createElement(readerMeta.component, { ...readerMeta.args, ...story.args })
            : createElement(new URLSearchParams(location.search).has('panel') ? App : Report);
          const root = createRoot(document.getElementById('root'));
          function Probe({ name }) {
            const { t, language, dir } = useTranslation();
            return createElement('output', { 'data-scope': name, 'data-language': language, 'data-dir': dir }, t('report.preview'));
          }
          if (new URLSearchParams(location.search).has('scope')) {
            const scopedDictionaries = {
              en: { 'report.preview': 'Host preview' },
              de: { 'report.preview': 'Host Vorschau' },
            };
            window.renderTranslationScope = (language) => root.render(createElement('div', null,
              createElement(TranslationProvider, { language, dir: 'rtl', dictionaries: scopedDictionaries },
                createElement(Probe, { name: 'controlled' }),
                createElement(FrameThumbnail, { src: 'image.png', label: 'Image', expanded: false, controlsId: 'scope-image', onToggle: () => {} })),
              createElement(TranslationProvider, { language: 'en' }, createElement(Probe, { name: 'fixed' })),
              createElement(Probe, { name: 'standalone' })));
            window.renderTranslationScope('de');
          } else root.render(view);
        `,
        resolveDir: fileURLToPath(new URL('../../apps/extension/', import.meta.url)),
        loader: 'tsx',
      },
      alias: workspaceAliases,
      bundle: true,
      format: 'iife',
      outfile: 'report.js',
      write: false,
      jsx: 'automatic',
    });
    const script = bundle.outputFiles!.find((file) => file.path.endsWith('.js'))!.text;
    const css = bundle.outputFiles!.find((file) => file.path.endsWith('.css'))!.text;
    server = createServer((request, response) => {
      if (request.url === '/report.js') {
        response.writeHead(200, { 'content-type': 'text/javascript' });
        response.end(script);
      } else if (request.url === '/report.css') {
        response.writeHead(200, { 'content-type': 'text/css' });
        response.end(css);
      } else {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html data-color-mode="light"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/report.css"></head><body><div id="root"></div><script src="/report.js"></script></body></html>');
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

  async function openReport(query: string, width = 1280): Promise<Page> {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800 });
    await page.evaluateOnNewDocument(({ recording, panel }) => {
      let resolveSettings!: (report: ReportSettings) => void;
      let savedSettings: { settings: { privacy: null; report: ReportSettings } } | undefined;
      const settings = new Promise((resolve) => {
        resolveSettings = (report) => {
          savedSettings = { settings: { privacy: null, report } };
          resolve(savedSettings);
        };
      });
      window.reportLocalisationTest = { resolveSettings, download: null, panelConnections: 0, panelMessage: () => {} };
      Object.assign(globalThis, {
        chrome: {
          storage: { local: { get: () => savedSettings ? Promise.resolve(savedSettings) : settings } },
          runtime: {
            connect: ({ name }: { name: string }) => {
              if (name === 'journey') {
                window.reportLocalisationTest.panelConnections++;
                return {
                  onMessage: { addListener: (listener: (message: WorkerMessage) => void) => {
                    window.reportLocalisationTest.panelMessage = listener;
                    queueMicrotask(() => listener({ type: 'snapshot', status: panel.status, captures: panel.captures, clips: panel.clips }));
                  } },
                  onDisconnect: { addListener: () => {} },
                  disconnect: () => {},
                  postMessage: () => {},
                };
              }
              let receive!: (message: ReportResponse) => void;
              return {
                onMessage: { addListener: (listener: typeof receive) => { receive = listener; } },
                onDisconnect: { addListener: () => {} },
                disconnect: () => {},
                postMessage: (request: ReportRequest) => queueMicrotask(() => {
                  if (request.sessionId !== recording.meta.id) {
                    receive({ type: 'error', message: 'Recording unavailable.' });
                  } else if (request.type === 'get') {
                    receive({ type: 'summary', meta: recording.meta, total: recording.items.length });
                  } else {
                    receive({ type: 'item', index: request.index, item: recording.items[request.index]! });
                  }
                }),
              };
            },
          },
        },
      });
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob | MediaSource) => {
        if (blob instanceof Blob && blob.type === 'application/zip') window.reportLocalisationTest.download = blob;
        return createObjectURL(blob);
      };
      document.addEventListener('click', (event) => {
        if (event.target instanceof HTMLAnchorElement && event.target.download) event.preventDefault();
      });
    }, { recording: storyReportWithClip, panel: donePanelState });
    await page.goto(url + query);
    return page;
  }

  it('shows loading and prevents editing while preferences are pending', async () => {
    const page = await openReport('?session=' + storyReportWithClip.meta.id);
    try {
      await page.waitForSelector('[role="status"]');
      expect(await page.$eval('[role="status"]', (element) => element.textContent)).toContain('Bericht wird geladen');
      expect(await page.$('textarea')).toBeNull();
    } finally { await page.close(); }
  });

  it.each(['en', 'de'] as const)('uses the saved %s language throughout the sidepanel without waiting to connect', async (language) => {
    const page = await openReport('?panel', 390);
    try {
      // A worker snapshot is visible while the settings read is still pending.
      await page.waitForSelector('button::-p-text(Bericht öffnen)');
      await page.evaluate((language) => window.reportLocalisationTest.resolveSettings({ language, tags: [] }), language);
      await page.waitForFunction((language) => document.documentElement.lang === language, {}, language);
      expect(await page.$eval('main', (element) => element.textContent)).toContain(language === 'de' ? 'Seite geladen' : 'Page loaded');
      expect(await page.$eval('main', (element) => element.textContent)).toContain(language === 'de' ? 'Dauer' : 'Duration');
      expect(await page.$('[aria-label="' + (language === 'de' ? 'Bild „Vorher“ öffnen' : 'Expand before frame') + '"]')).not.toBeNull();
      await page.evaluate((status) => window.reportLocalisationTest.panelMessage({ type: 'status', status }), recordingPanelState.status);
      await page.waitForSelector('button::-p-text(' + (language === 'de' ? 'Stoppen' : 'Stop') + ')');
      expect(await page.evaluate(() => window.reportLocalisationTest.panelConnections)).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    } finally { await page.close(); }
  });

  it('keeps recorder errors visible while language preferences are pending', async () => {
    const page = await openReport('?panel');
    try {
      await page.waitForSelector('main');
      await page.evaluate(() => window.reportLocalisationTest.panelMessage({ type: 'error', message: 'Original Chrome diagnostic' }));
      await page.waitForSelector('[role="alert"]');
      expect(await page.$eval('[role="alert"]', (element) => element.textContent)).toContain('Original Chrome diagnostic');
      expect(await page.$('[aria-label="Schließen"]')).not.toBeNull();
      await page.evaluate(() => window.reportLocalisationTest.resolveSettings({ language: 'en', tags: [] }));
      await page.waitForSelector('[aria-label="Dismiss"]');
      expect(await page.$eval('[role="alert"]', (element) => element.textContent)).toContain('Original Chrome diagnostic');
      expect(await page.evaluate(() => window.reportLocalisationTest.panelConnections)).toBe(1);
    } finally { await page.close(); }
  });

  it('updates a scope from provider props without changing sibling or standalone translations', async () => {
    const page = await openReport('?scope');
    try {
      await page.waitForSelector('[data-scope="controlled"]');
      expect(await page.$$eval('[data-scope]', (elements) => elements.map((element) =>
        [element.textContent, element.getAttribute('data-language'), element.getAttribute('data-dir')]))).toEqual([
        ['Host Vorschau', 'de', 'rtl'], ['Preview', 'en', 'ltr'], ['Preview', 'en', 'ltr'],
      ]);
      expect(await page.$eval('[aria-controls="scope-image"]', (element) => element.getAttribute('aria-label'))).toBe('Bild „Image“ öffnen');
      await page.evaluate(() => window.renderTranslationScope('en'));
      await page.waitForFunction(() => document.querySelector('[data-scope="controlled"]')?.textContent === 'Host preview');
      expect(await page.$$eval('[data-scope]', (elements) => elements.map((element) =>
        [element.textContent, element.getAttribute('data-language'), element.getAttribute('data-dir')]))).toEqual([
        ['Host preview', 'en', 'rtl'], ['Preview', 'en', 'ltr'], ['Preview', 'en', 'ltr'],
      ]);
      expect(await page.$eval('[aria-controls="scope-image"]', (element) => element.getAttribute('aria-label'))).toBe('Expand image frame');
    } finally { await page.close(); }
  });

  it.each(['', '?session=missing'])('shows known errors while preferences are pending: %s', async (query) => {
    const page = await openReport(query);
    try {
      await page.waitForSelector('[role="alert"]');
      expect(await page.$eval('[role="alert"]', (element) => element.textContent)).toContain(
        query ? 'Recording unavailable.' : 'Keine Aufzeichnung angegeben.',
      );
    } finally { await page.close(); }
  });

  it.each(['en', 'de'] as const)('uses the selected %s template for editing, preview, and download despite invalid privacy settings', async (language) => {
    const page = await openReport('?session=' + storyReportWithClip.meta.id);
    const template = getJourneyTemplate(language);
    const goal = template.header.find((field) => field.id === 'goal')!;
    try {
      await page.waitForSelector('[role="status"]');
      await page.evaluate((language) => window.reportLocalisationTest.resolveSettings({ language, tags: ['report.preview', 'event.click'] }), language);
      const selector = 'textarea[aria-label="' + goal.label + '"]';
      await page.waitForSelector(selector);
      await page.type(selector, 'Authored goal remains unchanged.');
      await page.click('button::-p-text(+ report.preview)');
      await page.click('button::-p-text(+ event.click)');
      expect(await page.$eval(selector, (element) => element.getAttribute('placeholder'))).toBe(goal.placeholder);
      expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual([language, 'ltr']);

      await page.click('header > button:first-of-type');
      await page.waitForFunction(() => !document.querySelector('textarea'));
      expect(await page.$eval('main', (element) => element.textContent)).toContain(goal.label);
      expect(await page.$eval('main', (element) => element.textContent)).toContain('Authored goal remains unchanged.');
      expect(await page.$eval('main', (element) => element.textContent)).toContain('report.preview');
      expect(await page.$eval('main', (element) => element.textContent)).toContain('event.click');

      // Changing the stored preference does not replace an open report's language or draft.
      await page.evaluate((language) => window.reportLocalisationTest.resolveSettings({ language: language === 'en' ? 'de' : 'en', tags: [] }), language);

      await page.click('header > button:last-of-type');
      const bytes = await page.evaluate(async () =>
        Array.from(new Uint8Array(await window.reportLocalisationTest.download!.arrayBuffer())));
      const report = readReportArtifacts(unzipStored(Uint8Array.from(bytes)));
      expect(report.template).toEqual(template);
      expect(report.draft.fields.goal).toBe('Authored goal remains unchanged.');
      expect(report.draft.tags).toEqual(['report.preview', 'event.click']);
    } finally { await page.close(); }
  });

  it.each([
    { story: 'German', language: 'de', dir: 'ltr', width: 390 },
    { story: 'German', language: 'de', dir: 'ltr', width: 1280 },
    { story: 'EnglishRtl', language: 'en', dir: 'rtl', width: 390 },
    { story: 'EnglishRtl', language: 'en', dir: 'rtl', width: 1280 },
  ])('renders the $story reader story at $width pixels with matching portaled direction', async ({ story, language, dir, width }) => {
    const page = await openReport('?story=' + story, width);
    try {
      await page.waitForSelector('main');
      expect(await page.$eval('main', (element) => element.textContent)).toContain(language === 'de' ? 'Mein Ziel' : 'My goal');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: '/tmp/chromium-watch-reader-' + story + '-' + width + '.png' });
      await page.$eval('[data-frame-index]', (element) => element.scrollIntoView({ block: 'center' }));
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.$eval('[data-frame-index]', (element) => (element as HTMLButtonElement).focus({ preventScroll: true }));
      await page.waitForSelector('[role="tooltip"]');
      expect(await page.$eval('[role="tooltip"]', (element) => [element.getAttribute('lang'), element.getAttribute('dir')])).toEqual([language, dir]);
    } finally { await page.close(); }
  });
});
