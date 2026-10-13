import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MilestoneCapture } from '@openuji/core';
import { compilePrivacy, createPrivacy, privacyProfileFromDocument } from '@openuji/privacy';

const settingsUrl = new URL('../settings.defaults.json', import.meta.url);
const settings = JSON.parse(readFileSync(settingsUrl, 'utf8')) as { privacy: { profilePath: string } };
const configuredDocument = JSON.parse(readFileSync(new URL(settings.privacy.profilePath, settingsUrl), 'utf8'));
const configuredProfile = privacyProfileFromDocument(configuredDocument);
const fixtureScope = configuredProfile.scopes.find((scope) => 'prefix' in scope.path) ?? configuredProfile.scopes[0]!;
const scopePrefix = 'prefix' in fixtureScope.path ? fixtureScope.path.prefix.replace(/\/+$/, '') : undefined;
const fixturePath = 'prefix' in fixtureScope.path ? `${scopePrefix}/resource` : fixtureScope.path.exact;
const origin = fixtureScope.origin.replace(/:\*$/, '');
const protectedUrl = `${origin}${fixturePath}?person=person-123&session=synthetic-session&flow=synthetic-flow`;
const safeUrl = `${origin}${fixturePath}?person=person&session=private&flow=private`;
// Extend the packaged profile fixture with synthetic metadata so output behavior
// is exercised without assuming any tenant-specific redaction policy.
const fixtureProfile = {
  ...configuredProfile,
  metadata: [
    ...(configuredProfile.metadata ?? []),
    { id: 'test-person', scopeRefs: [fixtureScope.id], fields: ['url', 'title', 'text', 'identifier', 'link'] as const,
      pattern: 'person-[^/?#;&"\\]\\s]+', replacement: 'person' },
    { id: 'test-session', scopeRefs: [fixtureScope.id], fields: ['url', 'title', 'text', 'identifier', 'link'] as const,
      pattern: 'session=[^?&;#"\\]\\s]+', replacement: 'session=private' },
    { id: 'test-flow', scopeRefs: [fixtureScope.id], fields: ['url', 'title', 'text', 'identifier', 'link'] as const,
      pattern: 'flow=[^?&;#"\\]\\s]+', replacement: 'flow=private' },
  ],
};

function privacy() {
  return createPrivacy(fixtureProfile);
}

const capture: MilestoneCapture = {
  viewId: 1, entry: 'load', documentId: 1, loaderId: 'document-1', label: '10-load-01',
  url: protectedUrl, detail: `Open ${protectedUrl}`,
  frame: { index: 1, base64: 'unchanged pixels', scrollX: 0, scrollY: 0, viewportWidth: 600,
    viewportHeight: 400, pageScaleFactor: 1, receivedAtMs: 100, drawnAtMs: 95 },
  domTarget: { tagName: 'a', selector: `a[href="${protectedUrl}"]`, id: 'person-123', name: 'session=synthetic-session',
    className: 'flow=synthetic-flow next', ariaLabel: `Open ${protectedUrl}`, textSnippet: `Continue to ${protectedUrl}`,
    href: protectedUrl, boundingRect: { x: 0, y: 0, width: 1, height: 1 } },
  scrollEpisode: { cause: { kind: 'link', detail: protectedUrl }, path: [] },
};

describe('privacy profile behavior', () => {
  it('compiles the packaged profile selected by extension settings', () => {
    expect(compilePrivacy(configuredProfile)).toBeDefined();
  });

  it('sanitizes scoped locations idempotently while preserving unrelated data', () => {
    const service = privacy();
    const location = { id: 7, url: protectedUrl, title: `Account ${protectedUrl}` };
    const expected = { ...location, url: safeUrl, title: `Account ${safeUrl}` };

    expect(service.sanitizeLocation(location)).toEqual(expected);
    expect(service.sanitizeLocation(expected)).toEqual(expected);
    expect(location.url).toBe(protectedUrl);
  });

  it('sanitizes capture and clip metadata before delivery without changing source data or pixels', async () => {
    const service = privacy();
    const before = JSON.stringify(capture);
    const captures = { name: 'captures', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    const clips = { name: 'clips', enqueue: vi.fn(), drain: vi.fn(async () => {}) };

    const captureSink = service.wrapCaptureSink(captures);
    const clipSink = service.wrapClipSink(clips);
    captureSink.enqueue(capture);
    clipSink.enqueue({ type: 'frame', id: 'clip-1', frame: capture.frame, position: null });
    clipSink.enqueue({ type: 'keep', id: 'clip-1', capture });
    clipSink.enqueue({ type: 'drop', id: 'clip-2' });
    await Promise.all([captureSink.drain(), clipSink.drain()]);

    const output = captures.enqueue.mock.calls[0]![0] as MilestoneCapture;
    expect(output.url).toBe(safeUrl);
    expect(output.detail).toBe(`Open ${safeUrl}`);
    expect(output.domTarget).toEqual({ ...capture.domTarget,
      selector: `a[href="${safeUrl}"]`, id: 'person', name: 'session=private',
      className: 'flow=private next', ariaLabel: `Open ${safeUrl}`, textSnippet: `Continue to ${safeUrl}`, href: safeUrl });
    expect(output.scrollEpisode?.cause.detail).toBe(safeUrl);
    expect(output.frame).toBe(capture.frame);
    expect(JSON.stringify(output)).not.toMatch(/person-123|synthetic-session|synthetic-flow/);
    expect(clips.enqueue.mock.calls[0]![0]).toEqual({ type: 'frame', id: 'clip-1', frame: capture.frame, position: null });
    expect(clips.enqueue.mock.calls[1]![0]).toEqual({ type: 'keep', id: 'clip-1', capture: output });
    expect(clips.enqueue.mock.calls[2]![0]).toEqual({ type: 'drop', id: 'clip-2' });
    expect(JSON.stringify(capture)).toBe(before);
    expect(captures.drain).toHaveBeenCalledTimes(1);
    expect(clips.drain).toHaveBeenCalledTimes(1);
  });

  it('leaves locations on another origin or outside the protected path unchanged', () => {
    const service = privacy();
    const outsideOrigin = new URL(`${origin}/`);
    outsideOrigin.hostname = `outside.${outsideOrigin.hostname}`;
    expect(service.sanitizeLocation({ url: `${outsideOrigin.origin}${fixturePath}?session=synthetic-session` }))
      .toEqual({ url: `${outsideOrigin.origin}${fixturePath}?session=synthetic-session` });
    if (scopePrefix && scopePrefix !== '/') {
      const siblingPath = `${scopePrefix}-outside/resource?session=synthetic-session`;
      expect(service.sanitizeLocation({ url: `${origin}${siblingPath}` })).toEqual({ url: `${origin}${siblingPath}` });
    }
  });
});
