import { describe, expect, it, vi } from 'vitest';
import { createFakeCdpTransport, createFakeTabHost, type FakeCdpTransport } from '@openuji/cdp/testing';
import { compilePrivacy, createPrivacy } from '@openuji/privacy';
import { PRIVACY_BINDING } from '../src/constants.js';
import { recordingPrivacyTransport } from '../src/recording-host.js';
import { css, profile, rule } from './fixtures.js';

const source = profile([css('name', '#name')], [rule('name')]);
const program = compilePrivacy(source);
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function prepare(cdp: FakeCdpTransport) {
  cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'top', loaderId: 'document-1', mimeType: 'text/html' } } } as never);
  cdp.respond('Runtime.enable', () => {
    cdp.emit('Runtime.executionContextCreated', { context: { id: 7, auxData: { isDefault: true, frameId: 'top' } } });
    return {};
  });
  cdp.respond('Performance.getMetrics', { metrics: [{ name: 'NavigationStart', value: 100 }] });
  cdp.respond('Page.addScriptToEvaluateOnNewDocument', { identifier: 'privacy' });
  cdp.respond('Runtime.evaluate', (params) => {
    if ((params as { expression: string }).expression.startsWith(`globalThis.${PRIVACY_BINDING}(`)) {
      cdp.emit('Runtime.bindingCalled', { name: PRIVACY_BINDING, executionContextId: 7,
        payload: JSON.stringify({ type: 'context', programId: program.id }) });
    }
    return { result: { type: 'object', value: { status: 'completed', matched: 1, overwritten: 1 } } };
  });
}
function rendered(cdp: FakeCdpTransport, contextId = 7, values = {}) {
  cdp.emit('Runtime.bindingCalled', { name: PRIVACY_BINDING, executionContextId: contextId,
    payload: JSON.stringify({ type: 'rendered', programId: program.id, documentToken: `1-${contextId}`,
      timeOriginMs: 1_000_000, afterMs: 50, applicable: 1, failed: 0, ...values }) });
}
function frame(cdp: FakeCdpTransport, monotonicTimestamp?: number) {
  const event = { sessionId: 12, data: 'pixels', metadata: { monotonicTimestamp } };
  cdp.emit('Page.screencastFrame', event);
  return event;
}

describe('privacy recording host', () => {
  it('awaits painted replacements and drops/acknowledges old frames using draw time, preserving admitted events', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const report = vi.fn();
    const guard = recordingPrivacyTransport(raw, program, report);
    const received = vi.fn(); guard.cdp.on('Page.screencastFrame', received);
    const ready = vi.fn(); void guard.ready.then(ready);
    await flush();
    frame(raw, 100.01);
    expect(received).not.toHaveBeenCalled();
    expect(raw.sent.at(-1)).toEqual({ method: 'Page.screencastFrameAck', params: { sessionId: 12 } });
    expect(ready).not.toHaveBeenCalled();
    rendered(raw); await guard.ready;
    frame(raw, 100.04); // Arrived AFTER readiness, drawn BEFORE replacement's paint.
    expect(received).not.toHaveBeenCalled();
    raw.advance(17);
    const admitted = frame(raw, 100.06);
    expect(received).toHaveBeenCalledWith(admitted, { receivedAtMs: 17 });
    expect(received.mock.calls[0]![0]).toBe(admitted);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
    await guard.dispose();
    expect(raw.listenerCount()).toBe(0);
  });

  it('requires new document evidence after navigation and ignores delayed old-document reports', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const guard = recordingPrivacyTransport(raw, program, vi.fn());
    const received = vi.fn(); guard.cdp.on('Page.screencastFrame', received);
    await flush(); rendered(raw); await guard.ready;
    raw.emit('Page.frameNavigated', { frame: { id: 'top', loaderId: 'document-2', mimeType: 'text/html' } });
    raw.emit('Runtime.executionContextCreated', { context: { id: 9, auxData: { isDefault: true, frameId: 'top' } } });
    rendered(raw, 7); frame(raw, 200.5);
    expect(received).not.toHaveBeenCalled();
    raw.respond('Performance.getMetrics', { metrics: [{ name: 'NavigationStart', value: 200 }] });
    rendered(raw, 9, { timeOriginMs: 1_100_000 }); await flush();
    frame(raw, 100.1); frame(raw, 200.04);
    expect(received).not.toHaveBeenCalled();
    frame(raw, 200.06);
    expect(received).toHaveBeenCalledTimes(1);
    await guard.dispose();
  });

  it('does not accept timing replies from a document replaced while the command was pending', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    let answer!: (value: unknown) => void;
    raw.respond('Performance.getMetrics', (() => new Promise((resolve) => { answer = resolve; })) as never);
    const guard = recordingPrivacyTransport(raw, program, vi.fn());
    const received = vi.fn(); guard.cdp.on('Page.screencastFrame', received);
    await flush(); rendered(raw); await flush();
    raw.emit('Page.frameNavigated', { frame: { id: 'top', loaderId: 'document-2' } });
    answer({ metrics: [{ name: 'NavigationStart', value: 100 }] }); await flush();
    frame(raw, 200);
    expect(received).not.toHaveBeenCalled();
    await guard.dispose();
  });

  it('waits for accessible child contexts and rejects frames predating their paint', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const guard = recordingPrivacyTransport(raw, program, vi.fn());
    const received = vi.fn(); guard.cdp.on('Page.screencastFrame', received);
    await flush();
    raw.emit('Page.frameAttached', { frameId: 'child' });
    raw.emit('Runtime.executionContextCreated', { context: { id: 8, auxData: { isDefault: true, frameId: 'child' } } });
    rendered(raw); await flush(); frame(raw, 100.1);
    expect(received).not.toHaveBeenCalled();
    rendered(raw, 8, { timeOriginMs: 1_000_040, afterMs: 100 }); await guard.ready;
    frame(raw, 100.13); expect(received).not.toHaveBeenCalled();
    frame(raw, 100.15); expect(received).toHaveBeenCalledTimes(1);
    await guard.dispose();
  });

  it('bounds absent readiness to five seconds and reports incomplete coverage while continuing', async () => {
    const host = createFakeTabHost({ prepare });
    const report = vi.fn();
    const attaching = createPrivacy(source, { onDiagnostic: report }).wrapHost(host).attach('tab');
    await flush();
    const raw = host.session('tab').cdp;
    const done = vi.fn(); void attaching.then(done);
    host.clock.advance(4_999); await flush(); expect(done).not.toHaveBeenCalled();
    host.clock.advance(1);
    const session = await attaching;
    const received = vi.fn(); session.cdp.on('Page.screencastFrame', received);
    frame(raw);
    expect(received).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 'readiness-timeout', coverage: 'incomplete' }));
    await session.close();
    expect(host.session('tab').closed).toBe(true);
    expect(raw.listenerCount()).toBe(0);
  });

  it('reports unsupported child contexts instead of claiming whole-page coverage', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const report = vi.fn(); const guard = recordingPrivacyTransport(raw, program, report);
    await flush();
    raw.emit('Page.frameAttached', { frameId: 'unreachable' });
    rendered(raw); await flush(); raw.advance(5_000); await guard.ready;
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 'uncovered-frame', coverage: 'incomplete' }));
    await guard.dispose();
  });

  it.each([
    { applicable: 0, failed: 0, status: 'missing-coverage' },
    { applicable: 2, failed: 1, status: 'rule-skipped' },
  ])('continues with $status when the profile does not cover the document', async ({ applicable, failed, status }) => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const report = vi.fn(); const guard = recordingPrivacyTransport(raw, program, report);
    const received = vi.fn(); guard.cdp.on('Page.screencastFrame', received);
    await flush(); rendered(raw, 7, { applicable, failed }); await guard.ready;
    frame(raw, 100.06);
    expect(received).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status, coverage: 'incomplete' }));
    expect(report).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
    await guard.dispose();
  });

  it('reports unsupported documents already present at attachment', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    raw.respond('Page.getFrameTree', { frameTree: { frame: { id: 'top', mimeType: 'application/pdf' } } } as never);
    const report = vi.fn(); const guard = recordingPrivacyTransport(raw, program, report);
    await guard.ready;
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 'unsupported-document', coverage: 'incomplete' }));
    expect(report).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' }));
    await guard.dispose();
  });

  it('allows frames without draw timestamps only with a timing warning', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const report = vi.fn(); const guard = recordingPrivacyTransport(raw, program, report);
    const received = vi.fn(); guard.cdp.on('Page.screencastFrame', received);
    await flush(); rendered(raw); await guard.ready;
    frame(raw); frame(raw);
    expect(received).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.filter(([d]) => d.status === 'timing-unavailable')).toHaveLength(1);
    await guard.dispose();
  });

  it('continues on installation failure with a fixed diagnostic that excludes exception data', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    raw.respond('Page.addScriptToEvaluateOnNewDocument', () => { throw new Error('private URL and identity'); });
    const report = vi.fn(); const guard = recordingPrivacyTransport(raw, program, report);
    await guard.ready;
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 'installation-failed', coverage: 'incomplete' }));
    expect(JSON.stringify(report.mock.calls)).not.toContain('private URL');
    await guard.dispose();
  });

  it('passes lifecycle URLs through unchanged for the engine and disposes idempotently', async () => {
    const raw = createFakeCdpTransport(); prepare(raw);
    const guard = recordingPrivacyTransport(raw, program, vi.fn());
    const listener = vi.fn(); guard.cdp.on('Page.navigatedWithinDocument', listener);
    const event = { frameId: 'top', url: 'https://example.test/private-route' };
    raw.emit('Page.navigatedWithinDocument', event);
    expect(listener).toHaveBeenCalledWith(event, { receivedAtMs: 0 });
    const disposing = guard.dispose(); expect(guard.dispose()).toBe(disposing); await disposing;
  });
});
