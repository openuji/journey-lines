import { describe, expect, it } from 'vitest';
import type { ViewState } from '@openuji/core';
import {
  classifyNavigation,
  enterView,
  isDocumentReport,
  pathOrHashRoute,
  type NavigatedEvent,
} from '@openuji/engine';
import { frame, navigated, withinDocument } from './helpers.js';

const at = (path: string): string => `https://example.com${path}`;

const view = (overrides: Partial<ViewState> = {}): ViewState => ({
  id: 3,
  documentId: 2,
  loaderId: 'loader-a',
  url: at('/list'),
  entry: 'load',
  firstFrameObserved: true,
  lastFrame: frame({ scrollY: 90 }),
  position: { x: 0, y: 90 },
  ...overrides,
});

const asNavigated = (event: ReturnType<typeof navigated>): NavigatedEvent =>
  event as NavigatedEvent;

describe('pathOrHashRoute', () => {
  it.each([
    ['a path change', '/list', '/list/42', true],
    ['a different origin', '/list', 'https://other.example/list', true],
    ['a query-only change', '/list', '/list?q=shoes', false],
    ['the same URL', '/list?q=1', '/list?q=1', false],
    ['an anchor jump', '/docs', '/docs#install', false],
    ['a hash route change', '/#/inbox', '/#/inbox/7', true],
    ['a hashbang route change', '/#!/inbox', '/#!/sent', true],
    ['leaving a hash route for an anchor', '/#/inbox', '/#top', true],
  ])('%s → %s', (_name, from, to, expected) => {
    const toUrl = to.startsWith('http') ? to : at(to);
    expect(pathOrHashRoute(at(from), toUrl)).toBe(expected);
  });

  it('falls back to comparing the strings when a URL does not parse', () => {
    expect(pathOrHashRoute('not a url', 'not a url')).toBe(false);
    expect(pathOrHashRoute('not a url', 'still not')).toBe(true);
  });
});

describe('classifyNavigation', () => {
  it('starts a view on a load, and on the first document', () => {
    expect(classifyNavigation(view(), asNavigated(navigated('loader-b')), pathOrHashRoute)).toEqual({
      kind: 'new-view',
      entry: 'load',
    });
    expect(classifyNavigation(null, asNavigated(navigated('loader-a')), pathOrHashRoute)).toEqual({
      kind: 'new-view',
      entry: 'load',
    });
  });

  it('starts a view on a route change, and only updates the URL otherwise', () => {
    const route = asNavigated(withinDocument(at('/list/42')));
    const filter = asNavigated(withinDocument(at('/list?q=shoes')));

    expect(classifyNavigation(view(), route, pathOrHashRoute)).toEqual({
      kind: 'new-view',
      entry: 'route',
    });
    expect(classifyNavigation(view(), filter, pathOrHashRoute)).toEqual({ kind: 'url-update' });
  });

  it('treats a commit under the loader already showing as a URL update', () => {
    expect(
      classifyNavigation(view(), asNavigated(navigated('loader-a', at('/moved'))), pathOrHashRoute),
    ).toEqual({ kind: 'url-update' });
  });

  it("ignores subframes, and same-document changes with nothing showing", () => {
    const child = asNavigated(withinDocument(at('/x'), 'loader-c', { isMainFrame: false }));

    expect(classifyNavigation(view(), child, pathOrHashRoute)).toBeNull();
    expect(classifyNavigation(null, asNavigated(withinDocument(at('/x'))), pathOrHashRoute)).toBeNull();
  });
});

describe('enterView', () => {
  const counts = { views: 3, documents: 2 };

  it('keeps the document and its frames for a route', () => {
    const next = enterView(view(), asNavigated(withinDocument(at('/list/42'))), 'route', counts);

    expect(next).toMatchObject({
      id: 4,
      documentId: 2,
      loaderId: 'loader-a',
      url: at('/list/42'),
      entry: 'route',
      firstFrameObserved: true,
      lastFrame: { scrollY: 90 },
    });
  });

  it('starts from nothing for a load', () => {
    const next = enterView(view(), asNavigated(navigated('loader-b', at('/other'))), 'load', counts);

    expect(next).toEqual({
      id: 4,
      documentId: 3,
      loaderId: 'loader-b',
      url: at('/other'),
      entry: 'load',
      firstFrameObserved: false,
      lastFrame: null,
      position: null,
    });
  });

  it('keeps where the page said it was across a route change', () => {
    const next = enterView(view(), asNavigated(withinDocument(at('/list/42'))), 'route', counts);

    expect(next.position).toEqual({ x: 0, y: 90 });
  });
});

describe('a new session on another tab', () => {
  it('starts a tab view with the document it finds, even the one showing', () => {
    expect(
      classifyNavigation(view(), asNavigated(navigated('loader-b')), pathOrHashRoute, true),
    ).toEqual({ kind: 'new-view', entry: 'tab' });
    expect(
      classifyNavigation(view(), asNavigated(navigated('loader-a')), pathOrHashRoute, true),
    ).toEqual({ kind: 'new-view', entry: 'tab' });
  });

  it('takes no subframe or same-document change for the document', () => {
    expect(
      classifyNavigation(
        view(),
        asNavigated(withinDocument(at('/x'), 'loader-a', { isMainFrame: false })),
        pathOrHashRoute,
        true,
      ),
    ).toBeNull();
    expect(isDocumentReport(withinDocument(at('/list/42')))).toBe(false);
    expect(isDocumentReport(navigated('loader-b'))).toBe(true);
  });

  it('starts a tab view from nothing, as a load does', () => {
    const next = enterView(view(), asNavigated(navigated('loader-b', at('/other'))), 'tab', {
      views: 3,
      documents: 2,
    });

    expect(next).toMatchObject({
      id: 4,
      documentId: 3,
      entry: 'tab',
      firstFrameObserved: false,
      lastFrame: null,
      position: null,
    });
  });
});
