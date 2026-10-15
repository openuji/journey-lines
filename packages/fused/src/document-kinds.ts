import type { DocumentKind } from '@journey-lines/stream-lifecycle';
import { htmlDocuments } from '@journey-lines/stream-html';
import { pdfDocuments } from '@journey-lines/stream-pdf';

/**
 * The kinds of document a recording observes. The first that describes a
 * document observes it, so a kind that claims some documents comes before the
 * one that describes them all.
 */
export const documentKinds: readonly DocumentKind[] = [pdfDocuments, htmlDocuments];
