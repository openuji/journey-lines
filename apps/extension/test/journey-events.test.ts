import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { journeyEvents } from '../src/lib/journey-events';
import { PanelView } from '../src/entrypoints/sidepanel/App';
import { donePanelState, recordingPanelState } from '../src/stories/panel-states';

function capture(viewId: number, label: string, receivedAtMs: number, detail = 'Internal diagnostic'): MilestoneCapture {
  return {
    viewId, entry: viewId === 1 ? 'load' : 'route', documentId: 1, loaderId: 'document',
    url: `https://app.example/${viewId}`, label, detail,
    frame: { index: receivedAtMs, receivedAtMs, base64: btoa(label), scrollX: 0, scrollY: 0, viewportWidth: 1280, viewportHeight: 720, pageScaleFactor: 1 },
  };
}

function clip(viewId: number, label: string): Clip {
  return { ...capture(viewId, label, 0), base64: '', mimeType: 'video/webm', trace: [] };
}

describe('journey event projection', () => {
  it('replaces loading frames without changing the arrival identity or time', () => {
    const first = capture(1, '00-first', 1_100);
    const ready = capture(1, '01-domcontentloaded', 1_200);
    const settled = capture(1, '02-settled', 1_300);
    const initial = journeyEvents([first], 1_000)[0]!;
    expect(journeyEvents([first, ready], 1_000)).toEqual([{ ...initial, frame: ready.frame }]);
    expect(journeyEvents([first, ready, settled], 1_000)).toEqual([{ ...initial, frame: settled.frame }]);
    expect(journeyEvents([first, settled, ready], 1_000)).toEqual([{ ...initial, frame: settled.frame }]);
    expect(initial.atMs).toBe(100);
  });

  it('pairs by view, kind and episode, and files each video with its event', () => {
    const captures = [
      capture(1, '00-first', 1_000),
      capture(1, '10-pre-click-01', 1_100), capture(1, '11-post-click-01', 1_200),
      capture(1, '03-pre-scroll-01', 1_300), capture(1, '04-post-scroll-01', 1_400),
      capture(2, '00-first', 1_500),
      capture(2, '10-pre-click-01', 1_600), capture(2, '11-post-click-01', 1_700),
    ];
    const videos = [clip(1, '11-post-click-01'), clip(1, '04-post-scroll-01'), clip(2, '11-post-click-01')];
    const events = journeyEvents(captures, 1_000, videos);
    expect(events.map((event) => event.key)).toEqual(['page:1', 'click:1:01', 'scroll:1:01', 'page:2', 'click:2:01']);
    expect(events[1]).toMatchObject({ before: captures[1]!.frame, after: captures[2]!.frame, clip: videos[0], atMs: 100 });
    expect(events[2]).toMatchObject({ before: captures[3]!.frame, after: captures[4]!.frame, clip: videos[1] });
    expect(events[4]).toMatchObject({ clip: videos[2] });
  });

  it('adds endpoints and late clips to the existing event', () => {
    const before = capture(1, '10-pre-click-01', 1_100);
    const after = capture(1, '11-post-click-01', 1_200);
    const initial = journeyEvents([before], 1_000);
    const completed = journeyEvents([before, after], 1_000);
    const video = clip(1, after.label);
    const filmed = journeyEvents([before, after], 1_000, [video]);
    expect(initial.map((event) => event.key)).toEqual(completed.map((event) => event.key));
    expect(filmed).toEqual([completed[0], { ...completed[1], clip: video }]);
    expect(initial[1]).not.toHaveProperty('after');
  });

  it('preserves post-only episodes and never borrows a missing frame from another event', () => {
    const after = capture(1, '04-post-scroll-01', 1_200);
    const events = journeyEvents([capture(1, '00-first', 1_000), after], 1_000);
    expect(events[1]).toMatchObject({ kind: 'scroll', after: after.frame });
    expect(events[1]).not.toHaveProperty('before');
    expect(journeyEvents([after], 1_000)[0]).not.toHaveProperty('frame');
  });

  it('keeps late, navigation-spanning responses in their origin view before its exit', () => {
    const captures = [
      capture(1, '00-first', 1_000), capture(1, '99-before-navigation', 1_200),
      capture(2, '00-first', 1_300), capture(2, '10-pre-click-01', 1_400),
      capture(1, '10-pre-click-01', 1_100), capture(1, '11-post-click-01', 1_500),
      capture(2, '11-post-click-01', 1_600),
    ];
    const video = clip(1, '11-post-click-01');
    const events = journeyEvents(captures, 1_000, [video]);
    expect(events.map((event) => event.key)).toEqual(['page:1', 'click:1:01', 'exit:1', 'page:2', 'click:2:01']);
    expect(events[1]).toMatchObject({ before: captures[4]!.frame, after: captures[5]!.frame, clip: video });
  });

  it('keeps first-capture interaction order even when completion order or frame times differ', () => {
    const events = journeyEvents([
      capture(1, '00-first', 1_000), capture(1, '03-pre-scroll-01', 1_500),
      capture(1, '10-pre-click-01', 1_100), capture(1, '11-post-click-01', 1_800),
      capture(1, '04-post-scroll-01', 1_600),
    ], 1_000);
    expect(events.map((event) => event.kind)).toEqual(['page', 'scroll', 'click']);
  });

  it('distinguishes navigation from stop even without a subsequent captured page', () => {
    const navigation = capture(1, '99-before-navigation', 1_200, 'Departing page; next URL is chrome://settings');
    expect(journeyEvents([navigation], 1_000)[1]).toMatchObject({ reason: 'navigation' });
    const stopped = { ...navigation, detail: 'Session ending; preserving final resting state' };
    expect(journeyEvents([stopped], 1_000)[1]).toMatchObject({ reason: 'recording-ended' });
  });

  it('preserves endpoint replacement and duplicate clip filing without replacing the first loading frame at equal priority', () => {
    const first = capture(1, '00-first', 1_000);
    const repeatedFirst = capture(1, '00-first', 1_050);
    const before = capture(1, '10-pre-click-01', 1_100);
    const replacementBefore = capture(1, '10-pre-click-01', 1_150);
    const after = capture(1, '11-post-click-01', 1_200);
    const replacementAfter = capture(1, '11-post-click-01', 1_250);
    const originalClip = clip(1, after.label);
    const replacementClip = { ...originalClip, base64: 'replacement' };
    const events = journeyEvents([
      first, repeatedFirst, before, after, replacementBefore, replacementAfter,
    ], 1_000, [originalClip, replacementClip]);
    expect(events[0]).toMatchObject({ frame: first.frame, atMs: 0 });
    expect(events[1]).toMatchObject({ before: replacementBefore.frame, after: replacementAfter.frame, atMs: 150, clip: replacementClip });
  });

  it('projects later snapshots without changing an earlier projection', () => {
    const first = capture(1, '00-first', 1_000);
    const before = capture(1, '10-pre-click-01', 1_100);
    const previous = journeyEvents([first, before], 1_000);
    const snapshot = structuredClone(previous);
    previous.forEach(Object.freeze);
    Object.freeze(previous);
    const next = journeyEvents([first, before, capture(1, '11-post-click-01', 1_200)], 1_000);
    expect(previous).toEqual(snapshot);
    expect(next[1]).toHaveProperty('after');
    expect(previous[1]).not.toHaveProperty('after');
    expect(next.map((event) => event.key)).toEqual(previous.map((event) => event.key));
  });

  it('is derived from inputs without modifying them or exposing capture diagnostics', () => {
    const captures = [capture(1, '00-first', 1_000), capture(1, '10-pre-click-01', 1_100)];
    const before = structuredClone(captures);
    captures.forEach((item) => { Object.freeze(item.frame); Object.freeze(item); });
    const events = journeyEvents(Object.freeze(captures), 1_000);
    expect(captures).toEqual(before);
    for (const event of events) {
      expect(event).not.toHaveProperty('label');
      expect(event).not.toHaveProperty('detail');
      expect(event).not.toHaveProperty('capture');
    }
    expect(journeyEvents([], 1_000)).toEqual([]);
    expect(journeyEvents([capture(1, 'unknown-internal-marker', 1_000)], 1_000)).toEqual([]);
  });
});

describe('event-based panel', () => {
  const actions = { onRecord: () => {}, onStop: () => {}, onReset: () => {}, onOpenReport: () => {}, onDismissError: () => {} };

  it.each([recordingPanelState, donePanelState])('renders one message per event with generic interaction labels', (state) => {
    const html = renderToStaticMarkup(createElement(PanelView, { state, ...actions }));
    expect(html.match(/class="timeline-row timeline-row--/g)).toHaveLength(6);
    expect(html).toContain('Page loaded');
    expect(html).toContain('Page changed');
    expect(html.match(/class="timeline-row__label">Click/g)).toHaveLength(2);
    expect(html).toContain('Before');
    expect(html).toContain('After');
    expect(html).not.toContain('pre-click');
    expect(html).not.toContain('post-scroll');
    expect(html).not.toContain('00-first');
    expect(html).not.toContain('compositor');
    expect(html).not.toContain('view-row');
  });

  it('counts the displayed events and views in the completed summary', () => {
    const html = renderToStaticMarkup(createElement(PanelView, { state: donePanelState, ...actions }));
    expect(html).toContain('<dt>Events</dt><dd>6</dd>');
    expect(html).toContain('<dt>Views</dt><dd>2</dd>');
    expect(html).not.toContain('<dt>Captures</dt>');
  });
});
