import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport, type FakeCdpTransport } from '@openuji/cdp/testing';
import type { DocumentEvent } from '@openuji/core';
import {
  createLifecycleStream,
  type CommittedDocument,
  type DocumentKind,
} from '@openuji/stream-lifecycle';
import {
  collect,
  frameNavigated,
  navigatedWithinDocument,
  showingDocument,
} from '../../cdp/test/events.js';

/** A kind a test drives: what it was shown, and a way to report as it would. */
interface FakeKind extends DocumentKind {
  readonly shown: Array<string | null>;
  readonly detached: boolean;
  report(event: DocumentEvent): void;
}

function fakeKind(describes: (document: CommittedDocument) => boolean): FakeKind {
  const shown: Array<string | null> = [];
  let emit: (event: DocumentEvent) => void = () => {};
  let detached = false;
  return {
    shown,
    get detached() {
      return detached;
    },
    report: (event) => emit(event),
    describes,
    async attach(_cdp, reportTo) {
      emit = reportTo;
      return {
        shown: (document) => shown.push(document?.loaderId ?? null),
        detach: async () => {
          detached = true;
        },
      };
    },
  };
}

const isPdf = (document: CommittedDocument): boolean => document.mimeType === 'application/pdf';
const settled = (loaderId: string): DocumentEvent => ({
  type: 'milestone',
  name: 'settled',
  loaderId,
  receivedAtMs: 0,
});

/** Compact view: what happened, and to which frame. */
function summarize(events: readonly DocumentEvent[]): string[] {
  return events.map((e) =>
    e.type === 'navigated'
      ? `${e.sameDocument ? 'navigated (same document)' : 'navigated'} ${e.loaderId} ${e.isMainFrame ? 'main' : 'sub'}`
      : e.type === 'milestone'
        ? `${e.name} ${e.loaderId}`
        : e.type,
  );
}

const start = (cdp: FakeCdpTransport, kinds: readonly DocumentKind[] = []) =>
  createLifecycleStream(cdp, kinds);

describe('createLifecycleStream (standalone)', () => {
  it('learns the document showing before its kinds attach', async () => {
    const cdp = createFakeCdpTransport();
    showingDocument(cdp, 'loader-now');
    const page = fakeKind(() => true);
    const { events, stop } = await start(cdp, [page]);
    page.report(settled('loader-now'));
    await stop();

    expect(cdp.sentMethods()).toEqual(['Page.enable', 'Page.getFrameTree']);
    expect(page.shown).toEqual(['loader-now']);
    expect(summarize(await collect(events))).toEqual([
      'navigated loader-now main',
      'settled loader-now',
    ]);
  });

  it('maps live commits, telling the main frame from subframes', async () => {
    const cdp = createFakeCdpTransport();
    const { events, stop } = await start(cdp);

    frameNavigated(cdp, 'loader-a');
    frameNavigated(cdp, 'loader-sub', { frameId: 'child', parentId: 'main' });
    await stop();

    expect(summarize(await collect(events))).toEqual([
      'navigated loader-a main',
      'navigated loader-sub sub',
    ]);
  });

  it("does not report a fresh tab's about:blank, but knows its frame is the main one", async () => {
    const cdp = createFakeCdpTransport();
    showingDocument(cdp, 'blank', 'about:blank');

    const { events, stop } = await start(cdp);
    frameNavigated(cdp, 'loader-a');
    navigatedWithinDocument(cdp, 'https://example.com/loader-a#top');
    await stop();

    expect(summarize(await collect(events))).toEqual([
      'navigated loader-a main',
      'navigated (same document) loader-a main',
    ]);
  });

  it('reports same-document navigations under the document they keep', async () => {
    const cdp = createFakeCdpTransport();
    const { events, stop } = await start(cdp);

    frameNavigated(cdp, 'loader-a', { url: 'https://app.example/' });
    navigatedWithinDocument(cdp, 'https://app.example/inbox');
    frameNavigated(cdp, 'loader-sub', { frameId: 'child', parentId: 'main' });
    navigatedWithinDocument(cdp, 'https://ads.example/#slot', {
      frameId: 'child',
      navigationType: 'fragment',
    });
    await stop();

    expect(await collect(events)).toMatchObject([
      { type: 'navigated', loaderId: 'loader-a', sameDocument: false },
      {
        type: 'navigated',
        frameId: 'main',
        isMainFrame: true,
        loaderId: 'loader-a',
        url: 'https://app.example/inbox',
        sameDocument: true,
        navigationType: 'historyApi',
      },
      { type: 'navigated', loaderId: 'loader-sub', sameDocument: false },
      {
        type: 'navigated',
        frameId: 'child',
        isMainFrame: false,
        loaderId: 'loader-sub',
        sameDocument: true,
        navigationType: 'fragment',
      },
    ]);
  });

  it('knows the documents showing at attach, subframes included', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getFrameTree', {
      frameTree: {
        frame: { id: 'main', loaderId: 'loader-now', url: 'https://app.example/' },
        childFrames: [
          { frame: { id: 'child', parentId: 'main', loaderId: 'loader-sub', url: 'https://ads.example/' } },
        ],
      },
    } as never);

    const { events, stop } = await start(cdp);
    navigatedWithinDocument(cdp, 'https://app.example/inbox');
    navigatedWithinDocument(cdp, 'https://ads.example/#2', { frameId: 'child' });
    await stop();

    expect(summarize(await collect(events))).toEqual([
      'navigated loader-now main',
      'navigated (same document) loader-now main',
      'navigated (same document) loader-sub sub',
    ]);
  });

  it("stamps receipt on the transport's clock", async () => {
    const cdp = createFakeCdpTransport({ startAtMs: 1_000 });
    showingDocument(cdp, 'loader-now');
    const { events, stop } = await start(cdp);

    cdp.advance(50);
    frameNavigated(cdp, 'loader-a');
    await stop();

    expect(await collect(events)).toMatchObject([
      // The document showing at attach comes from a command response, not an
      // event: it is stamped with the transport's clock at attach.
      { type: 'navigated', loaderId: 'loader-now', receivedAtMs: 1_000 },
      { type: 'navigated', loaderId: 'loader-a', receivedAtMs: 1_050 },
    ]);
  });

  describe('document kinds', () => {
    it('the first kind that describes a document observes it; every kind hears which shows', async () => {
      const cdp = createFakeCdpTransport();
      const pdf = fakeKind(isPdf);
      const page = fakeKind(() => true);
      const { stop } = await start(cdp, [pdf, page]);

      frameNavigated(cdp, 'loader-a');
      frameNavigated(cdp, 'loader-pdf', { mimeType: 'application/pdf' });
      frameNavigated(cdp, 'loader-sub', { frameId: 'child', parentId: 'main' });
      frameNavigated(cdp, 'loader-b');
      await stop();

      expect(pdf.shown).toEqual([null, null, 'loader-pdf', null]);
      expect(page.shown).toEqual([null, 'loader-a', null, 'loader-b']);
    });

    it("passes a kind's events only while one of its documents shows", async () => {
      const cdp = createFakeCdpTransport();
      const pdf = fakeKind(isPdf);
      const page = fakeKind(() => true);
      const { events, stop } = await start(cdp, [pdf, page]);

      frameNavigated(cdp, 'loader-pdf', { mimeType: 'application/pdf' });
      page.report(settled('loader-pdf'));
      pdf.report(settled('loader-pdf'));
      frameNavigated(cdp, 'loader-a');
      pdf.report(settled('loader-pdf'));
      page.report(settled('loader-a'));
      await stop();

      expect(summarize(await collect(events))).toEqual([
        'navigated loader-pdf main',
        'settled loader-pdf',
        'navigated loader-a main',
        'settled loader-a',
      ]);
    });

    it('a document no kind describes is seen in pictures only', async () => {
      const cdp = createFakeCdpTransport();
      const pdf = fakeKind(isPdf);
      const { events, stop } = await start(cdp, [pdf]);

      frameNavigated(cdp, 'loader-a');
      pdf.report(settled('loader-a'));
      await stop();

      expect(pdf.shown).toEqual([null, null]);
      expect(summarize(await collect(events))).toEqual(['navigated loader-a main']);
    });

    it('unsubscribes, detaches every kind and ends on stop', async () => {
      const cdp = createFakeCdpTransport();
      const pdf = fakeKind(isPdf);
      const page = fakeKind(() => true);
      const { events, stop } = await start(cdp, [pdf, page]);

      await stop();

      expect(cdp.listenerCount()).toBe(0);
      expect([pdf.detached, page.detached]).toEqual([true, true]);
      expect(await collect(events)).toEqual([]);
    });

    it('takes the kinds that did attach off again when one fails', async () => {
      const cdp = createFakeCdpTransport();
      const page = fakeKind(() => true);
      const broken: DocumentKind = {
        describes: () => false,
        attach: async () => {
          throw new Error('no');
        },
      };

      await expect(start(cdp, [page, broken])).rejects.toThrow('no');
      expect(page.detached).toBe(true);
      expect(cdp.listenerCount()).toBe(0);
    });
  });
});
