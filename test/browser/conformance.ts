/**
 * What every host must hold true against a real browser.
 *
 * The unit suites script Chromium through a fake transport; this one checks
 * that a real Chrome still sends what those scripts assume — the events, their
 * order and their fields. It runs against whatever Chrome the host launches, so
 * CI runs it once per Chrome major the recorder supports.
 *
 * Input goes through CDP (`./input.ts`), never a host automation API, so the
 * same suite can run unchanged on any host.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CdpTransport, RecordingTarget } from '@openuji/cdp';
import {
  QUIET_AFTER_MS,
  type CaptureSink,
  type ClipSink,
  type ClipWrite,
  type CompositorFrame,
  type LifecycleEvent,
  type MilestoneCapture,
} from '@openuji/core';
import { startRecording } from '@openuji/fused';
import { DocumentLabel } from '@openuji/rules-document';
import { episodeLabel, InteractionLabel } from '@openuji/rules-interaction';
import { createCompositorStream } from '@openuji/stream-compositor';
import { createInteractionStream } from '@openuji/stream-interaction';
import { createLifecycleStream } from '@openuji/stream-lifecycle';
import { ANCHOR, BUTTON, SPA, startFixtureServer, type FixtureServer } from './fixture.js';
import { click, press, wheel } from './input.js';

export interface HostUnderTest {
  /** A fresh target, not yet navigated anywhere. */
  launch(): Promise<RecordingTarget>;
  /** When set, the browser must report exactly this version, e.g. `154.0.8037.57`. */
  readonly expectedVersion?: string | undefined;
}

const WAIT = { timeout: 15_000, interval: 50 };

const PNG_SIGNATURE_BASE64 = 'iVBORw0KGgo';

const preClick = episodeLabel(InteractionLabel.preClick, 1);
const postClick = episodeLabel(InteractionLabel.postClick, 1);
const preScroll = episodeLabel(InteractionLabel.preScroll, 1);
const postScroll = episodeLabel(InteractionLabel.postScroll, 1);

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

const center = ({ x, y, width, height }: Rect) => ({ x: x + width / 2, y: y + height / 2 });

const BUTTON_CENTER = center(BUTTON);
const ANCHOR_CENTER = center(ANCHOR);

/** Clear of the button, inside any viewport the hosts use. */
const SCROLL_POINT = { x: 400, y: 400 };

class MemorySink implements CaptureSink {
  public readonly name = 'memory';
  public readonly captures: MilestoneCapture[] = [];

  public enqueue(capture: MilestoneCapture): void {
    this.captures.push(capture);
  }

  public async drain(): Promise<void> {}

  /** Capture labels in order, optionally only those of one document URL. */
  public labels(url?: string): string[] {
    return this.captures
      .filter((capture) => url === undefined || capture.url === url)
      .map((capture) => capture.label);
  }

  /** The scroll captures, optionally of one URL, each with where the page said it was. */
  public scrolls(url?: string): string[] {
    return this.captures
      .filter(
        (capture) =>
          (url === undefined || capture.url === url) &&
          (capture.label.startsWith(InteractionLabel.preScroll) ||
            capture.label.startsWith(InteractionLabel.postScroll)),
      )
      .map(({ label, position }) => `${label} ${position?.y ?? '?'}`);
  }

  /** What started each scroll, as its 04 says: `key PageDown`. */
  public causes(): string[] {
    return this.captures.flatMap(({ scrollEpisode }) =>
      scrollEpisode ? [[scrollEpisode.cause.kind, scrollEpisode.cause.detail].filter(Boolean).join(' ')] : [],
    );
  }
}

/** Records the clip writes, and reads back the frames of each kept clip. */
class MemoryClips implements ClipSink {
  public readonly name = 'memory-clips';
  public readonly writes: ClipWrite[] = [];

  public enqueue(write: ClipWrite): void {
    this.writes.push(write);
  }

  public async drain(): Promise<void> {}

  /** Each kept clip: the capture it belongs to, and its frames in order. */
  public kept(): { capture: MilestoneCapture; frames: CompositorFrame[] }[] {
    return this.writes.flatMap((keep) =>
      keep.type === 'keep'
        ? [
            {
              capture: keep.capture,
              frames: this.writes.flatMap((w) =>
                w.type === 'frame' && w.id === keep.id ? [w.frame] : [],
              ),
            },
          ]
        : [],
    );
  }
}

/** Consume a stream into an array the test can poll. */
function collect<T>(iterable: AsyncIterable<T>): T[] {
  const items: T[] = [];
  void (async () => {
    for await (const item of iterable) items.push(item);
  })();
  return items;
}

/** Until the top document is `url` and fully loaded. */
async function waitForLoaded(cdp: CdpTransport, url: string): Promise<void> {
  await vi.waitFor(async () => {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'location.href + " " + document.readyState',
      returnByValue: true,
    });
    expect(result.value).toBe(`${url} complete`);
  }, WAIT);
}

function milestonesOf(events: readonly LifecycleEvent[], loaderId: string): string[] {
  return events.flatMap((event) =>
    event.type === 'milestone' && event.isMainFrame && event.loaderId === loaderId
      ? [event.name]
      : [],
  );
}

export function describeHostConformance(name: string, host: HostUnderTest): void {
  describe(`${name} host against a real browser`, () => {
    let fixture: FixtureServer;

    beforeAll(async () => {
      fixture = await startFixtureServer();
    });

    afterAll(async () => {
      await fixture?.close();
    });

    /** Runs `body` against a fresh target and always closes it. */
    const withTarget = async (
      body: (target: RecordingTarget) => Promise<void>,
    ): Promise<void> => {
      const target = await host.launch();
      try {
        // A headed window that opens behind others is occluded, and Chrome
        // stops producing frames for it.
        await target.cdp.send('Page.bringToFront');
        await body(target);
      } finally {
        await target.close();
      }
    };

    it('runs the browser it was asked for', () =>
      withTarget(async ({ cdp }) => {
        const { product } = await cdp.send('Browser.getVersion');
        console.info(`[${name}] running ${product}`);

        if (host.expectedVersion) {
          expect(product.split('/').pop()).toBe(host.expectedVersion);
        }
      }));

    it('navigate: resolves only once the new document has committed', () =>
      withTarget(async (target) => {
        const { cdp } = target;
        const committed: string[] = [];
        const off = cdp.on('Page.frameNavigated', ({ frame }) => {
          if (!frame.parentId) committed.push(frame.url);
        });

        // Checked the instant `navigate` resolves — no waiting, no polling.
        for (const url of [fixture.url('/'), fixture.url('/second')]) {
          await target.navigate(url);
          expect(committed.at(-1)).toBe(url);

          const { result } = await cdp.send('Runtime.evaluate', {
            expression: 'location.href',
            returnByValue: true,
          });
          expect(result.value).toBe(url);
        }

        off();
      }));

    it('lifecycle: reports the navigation, then its milestones in order', () =>
      withTarget(async (target) => {
        const url = fixture.url('/');
        const lifecycle = await createLifecycleStream(target.cdp);
        const events = collect(lifecycle.events);

        await target.navigate(url);

        let loaderId = '';
        await vi.waitFor(() => {
          const navigated = events.find(
            (event) => event.type === 'navigated' && event.isMainFrame && event.url === url,
          );
          expect(navigated).toBeDefined();
          loaderId = navigated!.loaderId;
          expect(milestonesOf(events, loaderId)).toContain('networkAlmostIdle');
        }, WAIT);

        const milestones = milestonesOf(events, loaderId);
        expect(milestones).toEqual(
          expect.arrayContaining(['DOMContentLoaded', 'load', 'networkAlmostIdle']),
        );
        expect(milestones.indexOf('DOMContentLoaded')).toBeLessThan(
          milestones.indexOf('load'),
        );

        await lifecycle.stop();
      }));

    it('lifecycle: reports a route change as a same-document navigation of the document it keeps', () =>
      withTarget(async (target) => {
        const spa = fixture.url('/spa');
        const lifecycle = await createLifecycleStream(target.cdp);
        const events = collect(lifecycle.events);

        await target.navigate(spa);
        await waitForLoaded(target.cdp, spa);

        const { x, y } = center(SPA.link);
        await click(target.cdp, x, y);

        await vi.waitFor(() => {
          const loaded = events.find(
            (event) => event.type === 'navigated' && event.isMainFrame && event.url === spa,
          );
          expect(events).toContainEqual(
            expect.objectContaining({
              type: 'navigated',
              isMainFrame: true,
              url: fixture.url('/spa/b'),
              sameDocument: true,
              navigationType: 'historyApi',
              loaderId: loaded?.loaderId,
            }),
          );
        }, WAIT);

        await lifecycle.stop();
      }));

    it('compositor: keeps PNG frames flowing and reports scroll offsets', () =>
      withTarget(async (target) => {
        const url = fixture.url('/');
        const compositor = await createCompositorStream(target.cdp, {
          viewport: target.viewport,
        });
        const frames = collect(compositor.frames);

        await target.navigate(url);
        await waitForLoaded(target.cdp, url);

        // More than one frame means every frame was acknowledged: Chromium
        // withholds the next one until the previous is.
        await vi.waitFor(() => expect(frames.length).toBeGreaterThanOrEqual(3), WAIT);

        const first = frames[0]!;
        expect(first.base64.startsWith(PNG_SIGNATURE_BASE64)).toBe(true);
        if (target.viewport) {
          expect(first.viewportWidth).toBe(target.viewport.width);
        }

        await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 600);
        await vi.waitFor(
          () => expect(frames.some((frame) => frame.scrollY > 0)).toBe(true),
          WAIT,
        );

        await compositor.stop();
      }));

    it('interaction: the probe reports clicks', () =>
      withTarget(async (target) => {
        const url = fixture.url('/');
        const interaction = await createInteractionStream(target.cdp);
        const events = collect(interaction.events);

        await target.navigate(url);
        await waitForLoaded(target.cdp, url);

        await click(target.cdp, BUTTON_CENTER.x, BUTTON_CENTER.y);
        await vi.waitFor(() => {
          const clicked = events.find((event) => event.type === 'interaction' && event.action === 'click');
          expect(clicked?.type === 'interaction' && clicked.target.selector).toBe('button#go');
        }, WAIT);

        await interaction.stop();
      }));

    it('pipeline: captures every default milestone across a navigation', () =>
      withTarget(async (target) => {
        const first = fixture.url('/');
        const second = fixture.url('/second');
        const sink = new MemorySink();
        const recording = await startRecording(target.cdp, {
          sinks: [sink],
          screencast: { viewport: target.viewport },
        });

        const waitForLabel = (label: string, url: string): Promise<void> =>
          vi.waitFor(() => expect(sink.labels(url)).toContain(label), WAIT);

        await target.navigate(first);
        await waitForLabel(DocumentLabel.settled, first);

        await click(target.cdp, BUTTON_CENTER.x, BUTTON_CENTER.y);
        await waitForLabel(postClick, first);

        // The page keeps painting (its ticker), so frames show the scroll ending.
        await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 600);
        await waitForLabel(postScroll, first);

        await target.navigate(second);
        await waitForLabel(DocumentLabel.first, second);

        await recording.stop();

        const labels = sink.labels(first);
        expect(labels).toEqual(
          expect.arrayContaining([
            DocumentLabel.first,
            DocumentLabel.domContentLoaded,
            DocumentLabel.settled,
            preClick,
            postClick,
            DocumentLabel.beforeNavigation,
          ]),
        );
        expect(labels.indexOf(preClick)).toBeLessThan(
          labels.indexOf(postClick),
        );
        // One scroll, one pair, from the frames on either side of it. The
        // departing page's last frame may still arrive after the navigation,
        // in /second's view, but that is no scroll there.
        expect(sink.scrolls(first)).toEqual(['03-pre-scroll-01 0', '04-post-scroll-01 600']);
        expect(sink.scrolls(second)).toEqual([]);

        const clicked = sink.captures.find(
          (capture) => capture.label === postClick,
        );
        expect(clicked?.domTarget?.selector).toBe('button#go');
        for (const capture of sink.captures) {
          expect(capture.frame.base64.startsWith(PNG_SIGNATURE_BASE64)).toBe(true);
        }
      }));

    it('pipeline: a scroll on a page that stops painting ends by itself, with the frames from either side', () =>
      withTarget(async (target) => {
        const url = fixture.url('/still');
        const sink = new MemorySink();
        const clips = new MemoryClips();
        const recording = await startRecording(target.cdp, {
          sinks: [sink],
          clips,
          screencast: { viewport: target.viewport },
        });

        // What is on screen: the latest frame, and when it came.
        let onScreen = { data: '', atMs: 0 };
        const off = target.cdp.on('Page.screencastFrame', ({ data }, { receivedAtMs }) => {
          onScreen = { data, atMs: receivedAtMs };
        });

        await target.navigate(url);
        await waitForLoaded(target.cdp, url);
        await vi.waitFor(() => expect(sink.labels(url)).toContain(DocumentLabel.first), WAIT);
        // The page has stopped painting: what shows now is the page at rest.
        await vi.waitFor(
          () => expect(target.cdp.clock.now() - onScreen.atMs).toBeGreaterThan(QUIET_AFTER_MS),
          WAIT,
        );
        const atRest = onScreen.data;

        await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 600);
        await vi.waitFor(() => expect(sink.labels(url)).toContain(postScroll), WAIT);
        // The page scrolling itself: the case that once recorded one scroll twice.
        await target.cdp.send('Runtime.evaluate', { expression: 'scrollTo(0, 1400)' });
        await vi.waitFor(
          () => expect(sink.labels(url)).toContain(episodeLabel(InteractionLabel.postScroll, 2)),
          WAIT,
        );

        await recording.stop();
        off();

        expect(sink.scrolls(url)).toEqual([
          '03-pre-scroll-01 0',
          '04-post-scroll-01 600',
          '03-pre-scroll-02 600',
          '04-post-scroll-02 1400',
        ]);
        // The image itself: the 03 is the page at rest, even where a picture of
        // the move arrives before the page's report about it (headless), and
        // the 04 shows something else.
        const pre = sink.captures.find((capture) => capture.label === preScroll);
        const post = sink.captures.find((capture) => capture.label === postScroll);
        expect(pre?.frame.base64).toBe(atRest);
        expect(post?.frame.base64).not.toBe(pre?.frame.base64);

        // Each scroll's clip: every frame from its 03 to its 04, none missing,
        // none twice. The frames between include those that showed the scroll
        // before their offset did.
        const pairs = sink.captures.filter((c) => c.url === url && c.label.match(/^0[34]-/));
        const kept = clips.kept();
        expect(kept.map(({ capture }) => capture.label)).toEqual([
          postScroll,
          episodeLabel(InteractionLabel.postScroll, 2),
        ]);
        kept.forEach(({ capture, frames }, i) => {
          const [from, to] = [pairs[2 * i]?.frame, pairs[2 * i + 1]?.frame];
          expect(capture.frame).toBe(to);
          expect(frames[0]).toBe(from);
          expect(frames.at(-1)).toBe(to);
          const indices = frames.map((f) => f.index);
          expect(indices).toEqual(indices.map((_, k) => (from?.index ?? NaN) + k));
        });
      }));

    /** A recording of `/still`, at rest, and a way to read its scrolls. */
    const recordStill = async (target: RecordingTarget) => {
      const url = fixture.url('/still');
      const sink = new MemorySink();
      const recording = await startRecording(target.cdp, {
        sinks: [sink],
        screencast: { viewport: target.viewport },
      });
      await target.navigate(url);
      await waitForLoaded(target.cdp, url);
      await vi.waitFor(() => expect(sink.labels(url)).toContain(DocumentLabel.first), WAIT);
      await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS * 2));
      return { url, sink, recording };
    };

    const evaluate = (cdp: CdpTransport, expression: string) =>
      cdp.send('Runtime.evaluate', { expression, returnByValue: true });

    // Each way a person or the page starts a scroll. The touchpad gesture is
    // also the fu-berlin.de bug: one gesture recorded as two or three scrolls
    // while the frames' offsets stalled. The page's reports keep it one.
    for (const { by, cause, scroll } of [
      { by: 'a wheel', cause: 'wheel', scroll: (cdp: CdpTransport) => wheel(cdp, SCROLL_POINT.x, SCROLL_POINT.y, 600) },
      {
        by: 'a touchpad gesture',
        cause: 'touch',
        scroll: (cdp: CdpTransport) =>
          cdp.send('Input.synthesizeScrollGesture', {
            x: SCROLL_POINT.x,
            y: SCROLL_POINT.y,
            yDistance: -900,
            speed: 1200,
            gestureSourceType: 'touch',
          }),
      },
      { by: 'the PageDown key', cause: 'key PageDown', scroll: (cdp: CdpTransport) => press(cdp, 'PageDown') },
      { by: 'a link to a place on the page', cause: 'link #at-1800', scroll: (cdp: CdpTransport) => click(cdp, ANCHOR_CENTER.x, ANCHOR_CENTER.y) },
      { by: 'the page calling scrollTo', cause: 'script scrollTo', scroll: (cdp: CdpTransport) => evaluate(cdp, 'scrollTo(0, 1400)') },
      {
        by: 'the page scrolling an element into view, smoothly',
        cause: 'script scrollIntoView',
        scroll: (cdp: CdpTransport) =>
          evaluate(cdp, `document.getElementById('at-1800').scrollIntoView({ behavior: 'smooth' })`),
      },
    ]) {
      it(`pipeline: a scroll by ${by} is one scroll, and says what started it`, () =>
        withTarget(async (target) => {
          const { sink, recording } = await recordStill(target);

          await scroll(target.cdp);
          await vi.waitFor(() => expect(sink.labels()).toContain(postScroll), WAIT);
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          await recording.stop();

          // Of every URL: a link's scroll is filed under the URL with its
          // fragment, which Chrome shows before the page moves.
          const scrolls = sink.scrolls();
          expect(scrolls).toHaveLength(2);
          expect(scrolls[0]).toBe('03-pre-scroll-01 0');
          expect(Number(scrolls[1]?.split(' ')[1])).toBeGreaterThan(0);
          expect(sink.causes()).toEqual([cause]);
        }));
    }

    // Chrome keeps what is on screen in place when content above it changes
    // size (scroll anchoring), and reports that as the page scrolling.
    it('pipeline: content changing size above what is on screen is no scroll; the page is where it says', () =>
      withTarget(async (target) => {
        const { url, sink, recording } = await recordStill(target);

        await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 1800);
        await vi.waitFor(() => expect(sink.labels(url)).toContain(postScroll), WAIT);
        await evaluate(target.cdp, `document.querySelector('section').style.height = '900px'`);
        await vi.waitFor(async () => expect((await evaluate(target.cdp, 'scrollY')).result.value).toBe(2100), WAIT);
        // Longer than a scroll with no scrollend takes to end.
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        await recording.stop();

        expect(sink.scrolls(url)).toEqual(['03-pre-scroll-01 0', '04-post-scroll-01 1800']);
        expect(sink.captures.at(-1)).toMatchObject({ label: DocumentLabel.beforeNavigation, position: { y: 2100 } });
      }));

    it('pipeline: a spin of wheel notches is one scroll', () =>
      withTarget(async (target) => {
        const { url, sink, recording } = await recordStill(target);

        for (let notch = 0; notch < 5; notch++) {
          await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 100);
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
        await vi.waitFor(() => expect(sink.labels(url)).toContain(postScroll), WAIT);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        await recording.stop();

        expect(sink.scrolls(url)).toEqual(['03-pre-scroll-01 0', '04-post-scroll-01 500']);
      }));

    for (const [kind, link] of [
      ['pushes the URL, then renders', SPA.link],
      ['renders, then pushes the URL', SPA.lateLink],
    ] as const) {
      it(`pipeline: a route change that resets the scroll is no scroll (router ${kind})`, () =>
        withTarget(async (target) => {
          const spa = fixture.url('/spa');
          const routeB = fixture.url('/spa/b');
          const sink = new MemorySink();
          const recording = await startRecording(target.cdp, {
            sinks: [sink],
            screencast: { viewport: target.viewport },
          });

          await target.navigate(spa);
          await vi.waitFor(() => expect(sink.labels(spa)).toContain(DocumentLabel.settled), WAIT);

          await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 2000);
          await vi.waitFor(() => expect(sink.labels(spa)).toContain(postScroll), WAIT);

          // The router shows route B at the top. A frame can land on the wrong
          // side of the route change, in either direction.
          const at = center(link);
          await click(target.cdp, at.x, at.y);
          await vi.waitFor(() => expect(sink.labels(routeB)).toContain(DocumentLabel.first), WAIT);
          // Long enough for a fake scroll to have been decided, either side.
          await new Promise((resolve) => setTimeout(resolve, QUIET_AFTER_MS * 2));
          await recording.stop();

          expect(sink.scrolls(spa)).toEqual(['03-pre-scroll-01 0', '04-post-scroll-01 2000']);
          expect(sink.scrolls(routeB)).toEqual([]);
        }));
    }

    it('pipeline: an SPA route change is a view of its own, and every capture has the URL showing', () =>
      withTarget(async (target) => {
        const spa = fixture.url('/spa');
        const routeB = fixture.url('/spa/b');
        const filtered = fixture.url('/spa/b?q=x');
        const sink = new MemorySink();
        const recording = await startRecording(target.cdp, {
          sinks: [sink],
          screencast: { viewport: target.viewport },
        });

        const waitForLabel = (label: string, url: string): Promise<void> =>
          vi.waitFor(() => expect(sink.labels(url)).toContain(label), WAIT);

        await target.navigate(spa);
        await waitForLabel(DocumentLabel.settled, spa);

        const link = center(SPA.link);
        await click(target.cdp, link.x, link.y);
        await waitForLabel(DocumentLabel.first, routeB);

        const filter = center(SPA.filter);
        await click(target.cdp, filter.x, filter.y);
        await waitForLabel(postClick, filtered);

        await recording.stop();

        const view = (url: string) =>
          sink.captures
            .filter((capture) => capture.url === url)
            .map((capture) => `${capture.viewId} ${capture.entry} ${capture.label}`);

        // The click that changed the route keeps both its captures in the view
        // it was clicked in: Chrome reports the click before the route change.
        expect(view(spa)).toEqual(
          expect.arrayContaining([
            `1 load ${DocumentLabel.first}`,
            `1 load ${preClick}`,
            `1 load ${postClick}`,
            `1 load ${DocumentLabel.beforeNavigation}`,
          ]),
        );
        // A fresh view, numbering from 01 again.
        expect(view(routeB)).toEqual([`2 route ${DocumentLabel.first}`, `2 route ${preClick}`]);
        // A query-only update is not a new view, but the URL follows it.
        expect(view(filtered)).toEqual([
          `2 route ${postClick}`,
          `2 route ${DocumentLabel.beforeNavigation}`,
        ]);
        expect(new Set(sink.captures.map((capture) => capture.documentId)).size).toBe(1);
      }));

    it('pipeline: attached to a loaded page, captures no milestone it did not see', () =>
      withTarget(async (target) => {
        const url = fixture.url('/');

        // Load the page fully before the recording exists.
        const lifecycle = await createLifecycleStream(target.cdp);
        const events = collect(lifecycle.events);
        await target.navigate(url);
        await vi.waitFor(
          () =>
            expect(
              events.some(
                (event) =>
                  event.type === 'milestone' &&
                  event.isMainFrame &&
                  event.name === 'networkAlmostIdle',
              ),
            ).toBe(true),
          WAIT,
        );
        await lifecycle.stop();

        const sink = new MemorySink();
        const recording = await startRecording(target.cdp, {
          sinks: [sink],
          screencast: { viewport: target.viewport },
        });
        await vi.waitFor(() => expect(sink.labels()).toContain(DocumentLabel.first), WAIT);

        // Let plenty of frames pass: a milestone Chromium replayed from before
        // the recording would arm its rule, and the next frame would capture.
        await new Promise((resolve) => setTimeout(resolve, 500));
        await recording.stop();

        expect(sink.labels()).toEqual([DocumentLabel.first, DocumentLabel.beforeNavigation]);
      }));
  });
}
