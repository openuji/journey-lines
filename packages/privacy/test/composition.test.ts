import { describe, expect, it, vi } from 'vitest';
import type { ClipWrite, MilestoneCapture } from '@journey-lines/core';
import { compilePrivacy, createPrivacy, PrivacyCompileError } from '@journey-lines/privacy';
import { css, locatorId, profile, rule } from './fixtures.js';

const source = {
  ...profile([css('name', '#name')], [rule('name')]),
  metadata: [{ id: 'aliases', scopeRefs: ['page'], fields: ['url', 'title', 'text', 'identifier', 'link'] as const,
    pattern: 'fixture-original', replacement: 'donjoe' }],
};
const capture: MilestoneCapture = {
  viewId: 1, entry: 'load', documentId: 1, loaderId: 'chrome-loader', label: '10-pre-click-01',
  url: 'http://127.0.0.1:1234/fixture-original', detail: 'Click fixture-original',
  frame: { index: 1, base64: 'unchanged pixels', scrollX: 0, scrollY: 0, viewportWidth: 600,
    viewportHeight: 400, pageScaleFactor: 1, receivedAtMs: 100, drawnAtMs: 95 },
  domTarget: { tagName: 'a', selector: '#fixture-original', id: 'fixture-original', name: 'fixture-original',
    className: 'fixture-original', ariaLabel: 'fixture-original', textSnippet: 'fixture-original',
    href: '/user/fixture-original', boundingRect: { x: 0, y: 0, width: 1, height: 1 } },
  scrollEpisode: { cause: { kind: 'link', detail: '#fixture-original' }, path: [] },
};

describe('privacy output composition', () => {
  it('sanitizes capture fields before delivery without altering the source, timing or pixels', async () => {
    const before = JSON.stringify(capture);
    const sink = { name: 'store', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    const wrapped = createPrivacy(source).wrapCaptureSink(sink);
    wrapped.enqueue(capture); await wrapped.drain();
    const output = sink.enqueue.mock.calls[0]![0] as MilestoneCapture;
    expect(JSON.stringify(output)).not.toContain('fixture-original');
    expect(output.url).toBe('http://127.0.0.1:1234/donjoe');
    expect(output.frame).toBe(capture.frame);
    expect(output.loaderId).toBe('chrome-loader');
    expect(JSON.stringify(capture)).toBe(before);
    expect(sink.drain).toHaveBeenCalledTimes(1);
  });

  it('sanitizes the separate clip keep metadata path while frame and drop writes pass through', async () => {
    const sink = { name: 'clips', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    const wrapped = createPrivacy(source).wrapClipSink(sink);
    const writes: ClipWrite[] = [
      { type: 'frame', id: 'clip-1', frame: capture.frame, position: null },
      { type: 'keep', id: 'clip-1', capture }, { type: 'drop', id: 'clip-2' },
    ];
    writes.forEach((write) => wrapped.enqueue(write)); await wrapped.drain();
    expect(sink.enqueue.mock.calls[0]![0]).toBe(writes[0]);
    expect(sink.enqueue.mock.calls[2]![0]).toBe(writes[2]);
    expect(JSON.stringify(sink.enqueue.mock.calls[1])).not.toContain('fixture-original');
    expect(sink.drain).toHaveBeenCalledTimes(1);
  });

  it('sanitizes tab URLs and titles, retaining other fields and respecting page scopes', () => {
    const privacy = createPrivacy(source);
    const tab = { id: 7, windowId: 9, url: capture.url, title: 'Hello fixture-original' };
    expect(privacy.sanitizeLocation(tab)).toEqual({ ...tab, url: 'http://127.0.0.1:1234/donjoe', title: 'Hello donjoe' });
    const elsewhere = { ...tab, url: 'https://elsewhere.test/fixture-original' };
    expect(privacy.sanitizeLocation(elsewhere)).toEqual(elsewhere);
    expect(tab.title).toBe('Hello fixture-original');
  });

  it('compiles mask and display-attribute actions and forbids functional attributes', () => {
    const base = { id: 'username', scopeRefs: ['page'], locatorRef: locatorId('username') };
    expect(compilePrivacy(profile([css('username', '#username')], [
      { ...base, action: 'mask-input' },
      { ...base, id: 'label', action: 'replace-attribute', attribute: 'aria-label', replacement: 'Account holder' },
    ])).rules.map((r) => r.action)).toEqual(['mask-input', 'replace-attribute']);
    for (const attribute of ['value', 'name', 'type', 'href', 'action', 'id']) {
      expect(() => compilePrivacy(profile([css('username', '#username')], [
        { ...base, action: 'replace-attribute', attribute, replacement: 'Don Joe' } as never,
      ]))).toThrow(PrivacyCompileError);
    }
    expect(() => compilePrivacy(profile([css('username', '#username')], [
      { ...base, action: 'mask-input', replacement: 'must not be accepted' } as never,
    ]))).toThrow(PrivacyCompileError);
  });

  it('rejects invalid metadata patterns and unknown fields before recording starts', () => {
    for (const invalid of [{ pattern: '[' }, { fields: ['unknown'] }, { flags: 'gg' }, { scopeRefs: ['unknown'] }]) {
      expect(() => createPrivacy({ ...source, metadata: [{ ...source.metadata[0]!, ...invalid }] } as never)).toThrow(PrivacyCompileError);
    }
  });
});
