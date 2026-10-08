import type { DocumentProgress } from '@openuji/core';
import type { CommittedDocument, DocumentKind } from '@openuji/stream-lifecycle';
import { attachProbe } from '@openuji/stream-probe';

/**
 * Each step of `DocumentProgress`, and the events of Chromium's page lifecycle
 * it takes: a step is reached once all of them are. Settled is `load` — the
 * page's own images and scripts are in — and `networkAlmostIdle` — what it
 * fetches after that has calmed down, allowing a connection or two that never
 * closes. Either alone settles too early: `networkAlmostIdle` while the one
 * large image a page is about is still downloading, `load` before content a
 * script fetches afterwards.
 */
const STEPS: ReadonlyArray<readonly [DocumentProgress, readonly string[]]> = [
  ['ready', ['DOMContentLoaded']],
  ['settled', ['load', 'networkAlmostIdle']],
];

/**
 * Documents Chrome renders as pages — HTML, and with it plain text and images.
 * It describes every document, so it comes after the kinds that claim some.
 *
 * What it observes: how far the page has come, from Chromium's own lifecycle
 * (`Page.lifecycleEvent`), and what the person does, from the probe in the
 * page.
 */
export const htmlDocuments: DocumentKind = {
  describes: () => true,

  async attach(cdp, emit) {
    let document: CommittedDocument | null = null;
    let watching = false;
    /** By loader: the lifecycle events a document has reached, and the steps reported. */
    const documents = new Map<string, Readonly<{ events: Set<string>; steps: Set<DocumentProgress> }>>();

    const detachProbe = await attachProbe(cdp, emit);

    // What a document had reached before we watched counts toward its steps,
    // but a step is reported only when an event we see completes it: rules arm
    // on "the next frame after X", so X must be something we witnessed. Chromium
    // repeats `networkAlmostIdle` when a page fetches more and calms down again;
    // such a repeat completes `settled` for a page attached after its load.
    const offMilestones = cdp.on('Page.lifecycleEvent', ({ name, loaderId }, { receivedAtMs }) => {
      if (watching && loaderId !== document?.loaderId) return;
      const progress = documents.get(loaderId) ?? { events: new Set<string>(), steps: new Set<DocumentProgress>() };
      documents.set(loaderId, progress);
      progress.events.add(name);
      if (!watching) return;
      for (const [step, takes] of STEPS) {
        if (progress.steps.has(step) || !takes.includes(name)) continue;
        if (!takes.every((event) => progress.events.has(event))) continue;
        progress.steps.add(step);
        emit({ type: 'milestone', name: step, loaderId, receivedAtMs });
      }
    });
    try {
      // Chromium answers this only after reporting every milestone the current
      // document has already reached: the past, from here on the present.
      await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
    } catch (err) {
      offMilestones();
      await detachProbe();
      throw err;
    }
    watching = true;

    return {
      shown: (shown) => {
        document = shown;
        for (const loaderId of documents.keys()) {
          if (loaderId !== shown?.loaderId) documents.delete(loaderId);
        }
      },
      detach: async () => {
        offMilestones();
        await cdp.send('Page.setLifecycleEventsEnabled', { enabled: false }).catch(() => {});
        await detachProbe();
      },
    };
  },
};
