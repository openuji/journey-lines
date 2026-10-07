import { describe, expect, it, vi } from 'vitest';
import type { CdpTransport } from '@openuji/cdp';
import { QUIET_AFTER_MS, type CaptureSink, type Clip, type MilestoneCapture } from '@openuji/core';
import { startRecording } from '@openuji/fused';
import { launchPuppeteerTarget } from '@openuji/host-puppeteer';
import { DocumentLabel } from '@openuji/rules-document';
import { episodeLabel, InteractionLabel } from '@openuji/rules-interaction';
import { startClipWorker } from '@openuji/sinks';
import { describeHostConformance } from './conformance.js';
import { startFixtureServer } from './fixture.js';
import { wheel } from './input.js';

const env = process.env;
const WAIT = { timeout: 15_000, interval: 50 };
const headless = env['UXR_HEADLESS'] === '1' || env['UXR_HEADLESS'] === 'true';
const executablePath = env['UXR_CHROME_EXECUTABLE'];

/**
 * The pinned Chrome for Testing build by default. CI points
 * `UXR_CHROME_EXECUTABLE` at each Chrome major it exercises and sets
 * `UXR_CHROME_VERSION` to the build it installed, so a job that silently ran
 * some other Chrome fails instead of passing.
 *
 * Headed by default, as users run Chrome (CI provides a display through Xvfb).
 * `UXR_HEADLESS=1` switches to the pinned `chrome-headless-shell`.
 */
describeHostConformance('puppeteer', {
  launch: () => launchPuppeteerTarget({ headless, executablePath }),
  expectedVersion: env['UXR_CHROME_VERSION'],
});

/** `<innerWidth>x<innerHeight>@<devicePixelRatio>` of the page. */
async function layoutOf(cdp: CdpTransport): Promise<string> {
  const { result } = await cdp.send('Runtime.evaluate', {
    expression: '`${innerWidth}x${innerHeight}@${devicePixelRatio}`',
    returnByValue: true,
  });
  return result.value as string;
}

describe.skipIf(headless)('puppeteer host, headed', () => {
  it('lays the page out to its window, as a person sees it', async () => {
    const target = await launchPuppeteerTarget({
      headless: false,
      executablePath,
      viewport: { width: 1000, height: 700 },
    });
    try {
      expect(target.viewport).toBeUndefined();
      // Scale factor 1 even on a HiDPI screen, where any other blanks the
      // screencast's scroll offsets.
      expect(await layoutOf(target.cdp)).toBe('1000x700@1');

      // As if the user dragged the window smaller: a fixed viewport would keep
      // the page at 1000x700 and clip it.
      await target.page.resize({ contentWidth: 900, contentHeight: 600 });
      expect(await layoutOf(target.cdp)).toBe('900x600@1');
    } finally {
      await target.close();
    }
  });

  // Chrome moves the page's offset to keep what is on screen in place, and
  // reports that as the page scrolling, but nothing started a scroll.
  it('a window resize that moves the page is no scroll', async () => {
    const fixture = await startFixtureServer();
    const target = await launchPuppeteerTarget({
      headless: false,
      executablePath,
      viewport: { width: 1000, height: 700 },
    });
    const captures: MilestoneCapture[] = [];
    const sink: CaptureSink = { name: 'memory', enqueue: (c) => captures.push(c), drain: async () => {} };
    const labels = () => captures.map((c) => c.label);
    const scrollY = async (): Promise<number> =>
      (await target.cdp.send('Runtime.evaluate', { expression: 'scrollY', returnByValue: true })).result.value as number;
    try {
      await target.cdp.send('Page.bringToFront');
      const recording = await startRecording(target.cdp, { sinks: [sink], screencast: { viewport: target.viewport } });
      await target.navigate(fixture.url('/fluid'));
      await vi.waitFor(() => expect(labels()).toContain(DocumentLabel.first), WAIT);
      await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS * 2));
      await wheel(target.cdp, 400, 400, 1500);
      await vi.waitFor(() => expect(labels()).toContain(episodeLabel(InteractionLabel.postScroll, 1)), WAIT);

      const before = await scrollY();
      await target.page.resize({ contentWidth: 1400, contentHeight: 700 });
      await vi.waitFor(async () => expect(await scrollY()).toBeGreaterThan(before), WAIT);
      // Longer than a scroll with no scrollend takes to end.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await recording.stop();

      expect(labels().filter((label) => label.includes('-scroll-'))).toEqual([
        episodeLabel(InteractionLabel.preScroll, 1),
        episodeLabel(InteractionLabel.postScroll, 1),
      ]);
      expect(captures.at(-1)?.position?.y).toBe(await scrollY());
    } finally {
      await target.close();
      await fixture.close();
    }
  });
});

/**
 * How alike two pictures look, as PSNR of their luma in dB, measured in the
 * page by Chrome's own decoders: `video` at `atSeconds`, and a PNG. A clip's
 * pictures at half size come out at 27–30 dB; broken ones measured 7–9 dB.
 */
async function similarity(
  cdp: CdpTransport,
  video: string,
  atSeconds: number,
  png: string,
): Promise<{ psnr: number; duration: number }> {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const blob = (base64, type) => new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type });
      const video = document.createElement('video');
      video.muted = true;
      video.src = URL.createObjectURL(blob(${JSON.stringify(video)}, 'video/webm'));
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error(String(video.error?.message))); });
      video.currentTime = ${atSeconds};
      await new Promise((resolve) => (video.onseeked = resolve));
      const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const luma = () => {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const y = new Float32Array(d.length / 4);
        for (let i = 0; i < y.length; i++) y[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
        return y;
      };
      ctx.drawImage(video, 0, 0);
      const got = luma();
      ctx.drawImage(await createImageBitmap(blob(${JSON.stringify(png)}, 'image/png')), 0, 0, canvas.width, canvas.height);
      const want = luma();
      let se = 0;
      for (let i = 0; i < got.length; i++) se += (got[i] - want[i]) ** 2;
      return { psnr: 10 * Math.log10(255 ** 2 / (se / got.length)), duration: video.duration };
    })()`,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value as { psnr: number; duration: number };
}

describe('puppeteer host, scroll video (UXR_VIDEO)', () => {
  it("records a video of a scroll: from 03's picture to 04's, its trace one sample per frame", async () => {
    const fixture = await startFixtureServer();
    const target = await launchPuppeteerTarget({ headless, executablePath });
    const clips: Clip[] = [];
    const worker = await startClipWorker((clip) => clips.push(clip));
    const captures: MilestoneCapture[] = [];
    const sink: CaptureSink = { name: 'memory', enqueue: (c) => captures.push(c), drain: async () => {} };
    try {
      await target.cdp.send('Page.bringToFront');
      const recording = await startRecording(target.cdp, {
        sinks: [sink],
        clips: worker.sink,
        screencast: { viewport: target.viewport },
      });
      let lastFrameAtMs = 0;
      target.cdp.on('Page.screencastFrame', (_, { receivedAtMs }) => {
        lastFrameAtMs = receivedAtMs;
      });

      await target.navigate(fixture.url('/still'));
      await vi.waitFor(() => expect(captures.map((c) => c.label)).toContain(DocumentLabel.first), WAIT);
      // The page has stopped painting: a scroll can start from it at rest.
      await vi.waitFor(
        () => expect(target.cdp.clock.now() - lastFrameAtMs).toBeGreaterThan(QUIET_AFTER_MS),
        WAIT,
      );
      await wheel(target.cdp, 400, 400, 600);
      const postLabel = episodeLabel(InteractionLabel.postScroll, 1);
      await vi.waitFor(() => expect(captures.map((c) => c.label)).toContain(postLabel), WAIT);
      await recording.stop(); // drains the clip sink: the video is done

      const pre = captures.find((c) => c.label === episodeLabel(InteractionLabel.preScroll, 1));
      const post = captures.find((c) => c.label === postLabel);
      expect(clips).toHaveLength(1);
      const [clip] = clips;
      if (!clip || !pre || !post) throw new Error('no clip, or no scroll');

      expect(clip).toMatchObject({ viewId: post.viewId, label: postLabel, mimeType: 'video/webm' });
      // The trace: every frame from the 03 to the 04, in order, at increasing times.
      const { trace } = clip;
      expect(trace[0]).toMatchObject({ frameIndex: pre.frame.index, atMs: 0, y: 0 });
      expect(trace.at(-1)).toMatchObject({ frameIndex: post.frame.index, y: 600 });
      expect(trace.map((s) => s.frameIndex)).toEqual(trace.map((_, i) => pre.frame.index + i));
      expect(trace.every((s, i) => i === 0 || s.atMs > (trace[i - 1]?.atMs ?? Infinity))).toBe(true);

      // The pictures, as Chrome decodes them: the 03 first, the 04 held at the end.
      const end = ((trace.at(-1)?.atMs ?? NaN) + QUIET_AFTER_MS) / 1000;
      const first = await similarity(target.cdp, clip.base64, 0.001, pre.frame.base64);
      const last = await similarity(target.cdp, clip.base64, end - 0.05, post.frame.base64);
      expect(first.duration).toBeCloseTo(end, 2);
      expect(first.psnr).toBeGreaterThan(20);
      expect(last.psnr).toBeGreaterThan(20);
    } finally {
      await worker.close();
      await target.close();
      await fixture.close();
    }
  });
});
