/**
 * The document scrolling itself: where it is when the probe starts, every
 * position it reports, its `scrollend`, and what starts a scroll. Not an
 * element with its own scrollbar.
 */

import type { ScrollCauseWirePayload, ScrollWirePayload } from '@openuji/core/wire';
import { on } from './on.js';
import { observeScrollCauses } from './scroll-causes.js';

type Report = (payload: ScrollWirePayload | ScrollCauseWirePayload) => void;

/** Starts observing. Returns how to stop. */
export function observePageScroll(report: Report): () => void {
  const at = (action: ScrollWirePayload['action']): void => {
    report({ action, x: window.scrollX, y: window.scrollY, pageTimeMs: Date.now() });
  };
  const stops = [
    on('scroll', ({ target }) => {
      if (target === document) at('scroll');
    }),
    on('scrollend', ({ target }) => {
      if (target === document) at('scrollend');
    }),
    observeScrollCauses(report),
  ];

  // Where the page is now: the top of a new document, or wherever a page that
  // was already open has been scrolled to. A scroll's first report is where
  // it went; this is where it came from.
  at('position');

  return () => {
    for (const stop of stops) stop();
  };
}
