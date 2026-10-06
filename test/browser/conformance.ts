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
import type {
  CaptureSink,
  LifecycleEvent,
  MilestoneCapture,
} from '@openuji/core';
import { startRecording } from '@openuji/fused';
import { DocumentLabel } from '@openuji/rules-document';
import { episodeLabel, InteractionLabel } from '@openuji/rules-interaction';
import { createCompositorStream } from '@openuji/stream-compositor';
import { createInteractionStream } from '@openuji/stream-interaction';
import { createLifecycleStream } from '@openuji/stream-lifecycle';
import { BUTTON, SPA, startFixtureServer, type FixtureServer } from './fixture.js';
import { click, wheel } from './input.js';

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
const postScroll = episodeLabel(InteractionLabel.postScroll, 1);

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

const center = ({ x, y, width, height }: Rect) => ({ x: x + width / 2, y: y + height / 2 });

const BUTTON_CENTER = center(BUTTON);

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

  /** The scroll captures of one URL, each with the page offset its frame shows. */
  public scrolls(url: string): string[] {
    return this.captures
      .filter(
        (capture) =>
          capture.url === url &&
          (capture.label.startsWith(InteractionLabel.preScroll) ||
            capture.label.startsWith(InteractionLabel.postScroll)),
      )
      .map(({ label, frame }) => `${label} ${frame.scrollY}`);
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
          const clicked = events.find((event) => event.action === 'click');
          expect(clicked?.target.selector).toBe('button#go');
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
        // One scroll, one pair, from the frames on either side of it. Checked
        // per view: the departing page's last frame can still arrive after the
        // navigation and land in the next view (changes/scroll-rebuild.md).
        expect(sink.scrolls(first)).toEqual(['03-pre-scroll-01 0', '04-post-scroll-01 600']);
        const scrolled = sink.captures.find((capture) => capture.label === postScroll);
        expect(scrolled?.scrollEpisode?.settled).toBe(true);

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
        const recording = await startRecording(target.cdp, {
          sinks: [sink],
          screencast: { viewport: target.viewport },
        });

        await target.navigate(url);
        await waitForLoaded(target.cdp, url);
        await vi.waitFor(() => expect(sink.labels(url)).toContain(DocumentLabel.first), WAIT);

        await wheel(target.cdp, SCROLL_POINT.x, SCROLL_POINT.y, 600);
        await vi.waitFor(() => expect(sink.labels(url)).toContain(postScroll), WAIT);
        // The page scrolling itself: the case that once recorded one scroll twice.
        await target.cdp.send('Runtime.evaluate', { expression: 'scrollTo(0, 1400)' });
        await vi.waitFor(
          () => expect(sink.labels(url)).toContain(episodeLabel(InteractionLabel.postScroll, 2)),
          WAIT,
        );

        await recording.stop();

        expect(sink.scrolls(url)).toEqual([
          '03-pre-scroll-01 0',
          '04-post-scroll-01 600',
          '03-pre-scroll-02 600',
          '04-post-scroll-02 1400',
        ]);
        for (const capture of sink.captures) {
          if (capture.label.startsWith(InteractionLabel.postScroll)) {
            expect(capture.scrollEpisode?.settled).toBe(true);
          }
        }
      }));

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
