import type { DocumentProgress } from '@openuji/core';
import type { CommittedDocument, DocumentKind } from '@openuji/stream-lifecycle';
import { attachProbe } from '@openuji/stream-probe';

/** The steps of Chromium's page lifecycle that are steps of `DocumentProgress`. */
const PROGRESS: Readonly<Partial<Record<string, DocumentProgress>>> = {
  DOMContentLoaded: 'ready',
  networkAlmostIdle: 'settled',
};

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

    const detachProbe = await attachProbe(cdp, emit);
    try {
      // Chromium answers this only after reporting every milestone the current
      // document has already reached. Listening for milestones from here on
      // keeps that report of the past out: rules arm on "the next frame after
      // X", so X must be something we actually witnessed.
      await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
    } catch (err) {
      await detachProbe();
      throw err;
    }

    const offMilestones = cdp.on('Page.lifecycleEvent', ({ name, loaderId }, { receivedAtMs }) => {
      const progress = PROGRESS[name];
      if (progress && loaderId === document?.loaderId) {
        emit({ type: 'milestone', name: progress, loaderId, receivedAtMs });
      }
    });

    return {
      shown: (shown) => {
        document = shown;
      },
      detach: async () => {
        offMilestones();
        await cdp.send('Page.setLifecycleEventsEnabled', { enabled: false }).catch(() => {});
        await detachProbe();
      },
    };
  },
};
