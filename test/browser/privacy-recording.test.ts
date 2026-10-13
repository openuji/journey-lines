import { build } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CdpTransport, TabSession } from '@openuji/cdp';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { recordActiveTab, type ActiveTabRecording } from '@openuji/fused';
import { launchPuppeteerBrowser } from '@openuji/host-puppeteer';
import { createPrivacy, type PrivacyRecordingDiagnostic } from '@openuji/privacy';
import { startClipWorker } from '@openuji/sinks';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import { recordingArtifacts, type StoredRecording } from '@openuji/journey';
import { workspaceAliases } from '../../workspace-aliases';
import { launchWithExtension } from './extension-browser.js';
import { recordingProfile, startRecordingFixture } from './privacy-fixture.js';
import { click } from './input.js';

declare global { var privacyTest: typeof import('./privacy-extension-harness.js'); }
const WAIT = { timeout: 15_000, interval: 50 };

interface Harness {
  cdp: Pick<CdpTransport, 'send'>;
  captures(): Promise<readonly MilestoneCapture[]>;
  clips(): Promise<readonly Clip[]>;
  diagnostics(): Promise<readonly PrivacyRecordingDiagnostic[]>;
  probeReports(): Promise<readonly string[]>;
  open(url: string): Promise<void>;
  stop(): Promise<unknown>;
  close(): Promise<void>;
}
async function launch(mode: 'puppeteer' | 'extension', url: string): Promise<Harness> {
  if (mode === 'extension') {
    const extension = await launchWithExtension({ executablePath: process.env['UXR_CHROME_EXECUTABLE'] });
    try {
      const moduleUrl = await extension.worker.evaluate(() => globalThis.chrome.runtime.getURL('privacy-tests.js'));
      const bundle = await build({ entryPoints: ['test/browser/privacy-extension-harness.ts'], bundle: true,
        format: 'iife', globalName: 'privacyTest', platform: 'browser', target: 'chrome120',
        alias: workspaceAliases, define: { 'import.meta.url': JSON.stringify(moduleUrl) }, write: false });
      await extension.worker.evaluate(bundle.outputFiles[0]!.text);
      await extension.worker.evaluate((profile, url) => privacyTest.start(profile, url), recordingProfile, url);
      return {
        cdp: { send: ((method: string, params?: object) => extension.worker.evaluate(
          (method, params) => privacyTest.send(method, params), method, params)) as CdpTransport['send'] },
        captures: () => extension.worker.evaluate(() => privacyTest.captures()),
        clips: () => extension.worker.evaluate(() => privacyTest.clips()),
        diagnostics: () => extension.worker.evaluate(() => privacyTest.diagnostics),
        probeReports: () => extension.worker.evaluate(() => privacyTest.probeReports),
        open: async (url) => { await extension.worker.evaluate((url) => privacyTest.open(url), url); },
        stop: () => extension.worker.evaluate(() => privacyTest.stop()),
        close: () => extension.close(),
      };
    } catch (error) { await extension.close(); throw error; }
  }
  const chrome = await launchPuppeteerBrowser({ headless: true, executablePath: process.env['UXR_CHROME_EXECUTABLE'] });
  const captures: MilestoneCapture[] = [];
  const clips: Clip[] = [];
  const diagnostics: PrivacyRecordingDiagnostic[] = [];
  const probeReports: string[] = [];
  const privacy = createPrivacy(recordingProfile, { onDiagnostic: (d) => diagnostics.push(d) });
  const worker = await startClipWorker((clip) => clips.push(clip));
  await chrome.navigate(url);
  let inspection: TabSession | undefined;
  const recording: ActiveTabRecording<string> = await recordActiveTab(privacy.wrapHost(chrome.tabs), chrome.firstTab, {
    sinks: [privacy.wrapCaptureSink({ name: 'memory', enqueue: (c) => captures.push(c), drain: async () => {} })],
    clips: privacy.wrapClipSink(worker.sink), screencast: { viewport: chrome.viewport },
  });
  recording.cdp!.on('Runtime.bindingCalled', (event) => { if (event.name === PROBE_BINDING_NAME) probeReports.push(event.payload); });
  return {
    cdp: { send: ((method: string, params?: object) =>
      ((inspection?.cdp ?? recording.cdp!).send as (method: string, params?: object) => Promise<unknown>)(method, params)) as CdpTransport['send'] },
    captures: async () => captures, clips: async () => clips, diagnostics: async () => diagnostics,
    probeReports: async () => probeReports,
    open: async (url) => { await recording.cdp!.send('Target.createTarget', { url }); },
    stop: async () => { const tab = recording.status.active.tab; await recording.stop(); inspection = await chrome.tabs.attach(tab); return { captures, clips }; },
    close: async () => { await recording.stop(); await inspection?.close(); await worker.close(); await chrome.close(); },
  };
}

async function evaluate<T>(harness: Harness, expression: string): Promise<T> {
  const reply = await harness.cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text);
  return reply.result.value as T;
}

/** Compare just the identity region, in both screenshots and decoded video frames. */
async function aliasPixels(harness: Harness, picture: string, alias: string, original: string, video = false) {
  return evaluate<{ aliasError: number; originalError: number }>(harness, `(async () => {
    const load = async (data) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode(); return image;
    };
    let image;
    if (${video}) {
      image = document.createElement('video'); image.muted = true;
      image.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(${JSON.stringify(picture)}), c => c.charCodeAt(0))], {type:'video/webm'}));
      await new Promise((resolve, reject) => { image.onloadeddata = resolve; image.onerror = reject; });
      image.currentTime = 0.001; await new Promise(resolve => image.onseeked = resolve);
    } else image = await load(${JSON.stringify(picture)});
    const canvas = new OffscreenCanvas(550,70); const ctx = canvas.getContext('2d');
    const read = (source) => { const scale = (source.videoWidth || source.naturalWidth) / innerWidth;
      ctx.drawImage(source,20*scale,20*scale,550*scale,70*scale,0,0,550,70); return ctx.getImageData(0,0,550,70).data; };
    const actual = read(image);
    const error = expected => { const data = read(expected); let n=0; for(let i=0;i<data.length;i+=4) n += Math.abs(actual[i]-data[i]); return n/(data.length/4); };
    return {aliasError:error(await load(${JSON.stringify(alias)})), originalError:error(await load(${JSON.stringify(original)}))};
  })()`);
}

describe.each(['puppeteer', 'extension'] as const)('privacy recording through %s', (mode) => {
  let fixture: Awaited<ReturnType<typeof startRecordingFixture>>;
  let harness: Harness;
  beforeEach(async () => {
    fixture = await startRecordingFixture();
    harness = await launch(mode, `${fixture.url}/fixture-original`);
  });
  afterEach(async () => { await harness?.close(); await fixture?.close(); });

  it('records aliases in page, screenshots, video and all delivered metadata, retaining changes on stop', async () => {
    expect(await evaluate(harness, 'document.querySelector("#identity").textContent')).toBe('Don Joe');
    expect(await evaluate(harness, 'document.querySelector("#identity").title')).toBe('Don Joe');
    await vi.waitFor(async () => expect((await harness.captures()).length).toBeGreaterThan(0), WAIT);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await click(harness.cdp, 100, 145, 80);
    await vi.waitFor(async () => expect((await harness.captures()).some((c) => c.label.startsWith('11-post-click'))).toBe(true), WAIT);
    const alias = (await harness.cdp.send('Page.captureScreenshot', { format: 'png' })).data;
    const saved = await harness.stop();
    const captures = await harness.captures();
    const clips = await harness.clips();
    expect(clips.length).toBeGreaterThan(0);
    expect(JSON.stringify(saved)).not.toContain('fixture-original');
    if (mode === 'extension') {
      const stored = saved as StoredRecording;
      expect(stored.meta.tab.title).toBe('donjoe');
      const log = recordingArtifacts(stored.items).find((entry) => entry.name === 'interactions.ndjson')!;
      expect(new TextDecoder().decode(log.bytes)).not.toContain('fixture-original');
      expect(new TextDecoder().decode(log.bytes)).toContain('/donjoe');
    }
    expect(captures.every((c) => c.url.endsWith('/donjoe'))).toBe(true);
    expect(clips.every((c) => c.url.endsWith('/donjoe'))).toBe(true);
    expect(captures.some((c) => c.domTarget?.id === 'donjoe')).toBe(true);
    expect(await evaluate(harness, 'document.querySelector("#identity").textContent')).toBe('Don Joe');
    expect(await evaluate(harness, 'getComputedStyle(document.querySelector("#username")).webkitTextSecurity')).toBe('disc');
    expect(await evaluate(harness, 'location.pathname')).toBe('/fixture-original');
    // Synthetic reference pictures are test data, never held by the privacy runtime.
    await evaluate(harness, 'document.querySelector("#identity").textContent = "Fixture Original"');
    const original = (await harness.cdp.send('Page.captureScreenshot', { format: 'png' })).data;
    for (const capture of captures) {
      const comparison = await aliasPixels(harness, capture.frame.base64, alias, original);
      expect(comparison.aliasError).toBeLessThan(comparison.originalError / 2);
    }
    const video = await aliasPixels(harness, clips[0]!.base64, alias, original, true);
    expect(video.aliasError).toBeLessThan(video.originalError / 2);
    expect(JSON.stringify(await harness.diagnostics())).not.toMatch(/fixture-original|Fixture Original/);
    expect((await harness.diagnostics()).some((d) => d.type === 'coverage' && d.status === 'complete')).toBe(true);
  });

  it('masks typing, bulk insertion and autofill-style assignments while preserving submission and excluding values from probe descriptions', async () => {
    await evaluate(harness, 'document.querySelector("#username").focus()');
    await harness.cdp.send('Input.insertText', { text: 'typed-user' });
    expect(await evaluate(harness, 'getComputedStyle(document.activeElement).webkitTextSecurity')).toBe('disc');
    await evaluate(harness, 'document.querySelector("#password").focus()');
    await harness.cdp.send('Input.insertText', { text: 'pasted-secret' });
    expect(await evaluate(harness, 'getComputedStyle(document.activeElement).webkitTextSecurity')).toBe('disc');
    // Browser autofill changes values without replacing controls. Exercise that
    // assignment path independently of trusted typing; no saved password store.
    await evaluate(harness, 'document.querySelector("#username").value = "autofilled-user"');
    expect(await evaluate(harness, `(() => {
      const user=document.querySelector('#username'), password=document.querySelector('#password');
      return [user.type,user.name,user.value,password.type,password.name,password.value,getComputedStyle(user).webkitTextSecurity];
    })()`)).toEqual(['text', 'username', 'autofilled-user', 'password', 'password', 'pasted-secret', 'disc']);
    await evaluate(harness, 'document.querySelector("#login").requestSubmit()');
    await vi.waitFor(() => expect(fixture.submissions).toContain('username=autofilled-user&password=pasted-secret'), WAIT);
    // Probe the editable field and an ancestor containing textarea/contenteditable.
    await evaluate(harness, `document.querySelector('#username').click(); document.querySelector('#editable-parent').click();`);
    await vi.waitFor(async () => expect((await harness.probeReports()).some((payload) => payload.includes('editable-parent'))).toBe(true), WAIT);
    const reports = (await harness.probeReports()).map((payload) => JSON.parse(payload));
    expect(reports.find((r) => r.target?.id === 'username')?.target.textSnippet).toBeUndefined();
    expect(reports.find((r) => r.target?.id === 'editable-parent')?.target.textSnippet).toBe('Public label');
    expect(JSON.stringify(reports)).not.toMatch(/typed-user|autofilled-user|pasted-secret|private-textarea|private-editor|private-hidden/);
    await harness.stop();
    expect(JSON.stringify(await harness.captures())).not.toMatch(/typed-user|autofilled-user|pasted-secret|private-textarea|private-editor|private-hidden/);
  });

  it('applies the profile on navigation and tab switching without repeating a completed document pass', async () => {
    await harness.cdp.send('Page.navigate', { url: `${fixture.url}/second/fixture-original` });
    await vi.waitFor(async () => expect(await evaluate(harness, 'document.querySelector("#identity")?.textContent')).toBe('Don Joe'), WAIT);
    const diagnostics = await harness.diagnostics();
    const count = diagnostics.filter((d) => d.type === 'completed').length;
    await evaluate(harness, 'document.querySelector("#identity").textContent = "Later update"; history.replaceState(null,"","/changed")');
    expect((await harness.diagnostics()).filter((d) => d.type === 'completed')).toHaveLength(count);
    expect(await evaluate(harness, 'document.querySelector("#identity").textContent')).toBe('Later update');
    await harness.open(`${fixture.url}/new-tab/fixture-original`);
    await vi.waitFor(async () => expect(await evaluate(harness, 'location.pathname')).toBe('/new-tab/fixture-original'), WAIT);
    expect(await evaluate(harness, 'document.querySelector("#identity").textContent')).toBe('Don Joe');
    await vi.waitFor(async () => expect((await harness.captures()).some((c) => c.entry === 'tab' && c.url.endsWith('/new-tab/donjoe'))).toBe(true), WAIT);
    await harness.stop();
    expect((await harness.captures()).some((c) => c.entry === 'tab' && c.url.endsWith('/new-tab/donjoe'))).toBe(true);
  });
});
