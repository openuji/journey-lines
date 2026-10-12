import { describe, expect, it, vi } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import { attachPrivacy, type PrivacyProgram } from '@openuji/privacy';
import { PRIVACY_BINDING } from '../src/constants.js';

const program: PrivacyProgram = {
  id: 'test.v1', rules: [{ id: 'missing', selector: '#absent', replacement: 'Don Joe' }],
};

function transport() {
  const cdp = createFakeCdpTransport();
  cdp.respond('Runtime.enable', () => {
    cdp.emit('Runtime.executionContextCreated', { context: { id: 7, auxData: { isDefault: true, frameId: 'top' } } });
    return {};
  });
  cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'top' } } } as never);
  cdp.respond('Page.addScriptToEvaluateOnNewDocument', { identifier: 'privacy-1' });
  evaluate(cdp);
  return cdp;
}


function evaluate(cdp: ReturnType<typeof createFakeCdpTransport>, status: 'pending' | 'completed' = 'pending') {
  cdp.respond('Runtime.evaluate', (params) => {
    if ((params as { expression: string }).expression.startsWith(`globalThis.${PRIVACY_BINDING}(`)) {
      cdp.emit('Runtime.bindingCalled', {
        name: PRIVACY_BINDING, executionContextId: 7,
        payload: JSON.stringify({ type: 'context', programId: program.id }),
      });
    }
    return { result: { type: 'object', value: { status, matched: status === 'completed' ? 1 : 0, overwritten: status === 'completed' ? 1 : 0 } } };
  });
}

function complete(cdp: ReturnType<typeof transport>, context = 7, extra = {}) {
  cdp.emit('Runtime.bindingCalled', {
    name: PRIVACY_BINDING, executionContextId: context,
    payload: JSON.stringify({ type: 'completed', programId: program.id, matched: 0, overwritten: 0, ...extra }),
  });
}

describe('attachPrivacy', () => {
  it('installs future and current documents with the same source, and completes on a zero-match pass', async () => {
    const cdp = transport();
    const report = vi.fn();
    const attachment = await attachPrivacy(cdp, program, report);
    const registered = cdp.sent.find((command) => command.method === 'Page.addScriptToEvaluateOnNewDocument');
    const evaluated = cdp.sent.filter((command) => command.method === 'Runtime.evaluate').at(-1);
    expect(evaluated?.params).toMatchObject({
      contextId: 7, returnByValue: true, expression: (registered?.params as { source: string }).source,
    });
    complete(cdp);
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 0, overwritten: 0 });
    expect(report).toHaveBeenCalledWith({ type: 'completed', programId: program.id, matched: 0, overwritten: 0 });
    await attachment.dispose();
    expect(cdp.listenerCount()).toBe(0);
  });

  it('uses a completed snapshot when reinjection needs no new pass', async () => {
    const cdp = transport();
    evaluate(cdp, 'completed');
    const attachment = await attachPrivacy(cdp, program, vi.fn());
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 1, overwritten: 1 });
    await attachment.dispose();
  });

  it('cancels pending readiness on disposal, unregisters before cleanup, and disposes only once', async () => {
    const cdp = transport();
    const attachment = await attachPrivacy(cdp, program, vi.fn());
    const first = attachment.dispose();
    expect(attachment.dispose()).toBe(first);
    await first;
    await expect(attachment.ready).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
    expect(cdp.sentMethods().slice(-3)).toEqual([
      'Page.removeScriptToEvaluateOnNewDocument', 'Runtime.evaluate', 'Runtime.removeBinding',
    ]);
    expect(cdp.listenerCount()).toBe(0);
    expect(cdp.sentMethods()).not.toContain('Runtime.disable');
  });

  it.each(['Runtime.executionContextDestroyed', 'Runtime.executionContextsCleared'] as const)(
    'cancels the initial pass after %s', async (event) => {
      const cdp = transport();
      const attachment = await attachPrivacy(cdp, program, vi.fn());
      cdp.emit(event, { executionContextId: 7 });
      await expect(attachment.ready).resolves.toEqual({ status: 'cancelled', reason: 'document-replaced' });
      await attachment.dispose();
    },
  );

  it('accepts only known diagnostic fields from the top document', async () => {
    const cdp = transport();
    const report = vi.fn();
    const attachment = await attachPrivacy(cdp, program, report);
    cdp.emit('Runtime.bindingCalled', { name: PRIVACY_BINDING, executionContextId: 7, payload: 'private malformed data' });
    complete(cdp, 99);
    complete(cdp, 7, { programId: 'foreign' });
    complete(cdp, 7, { overwritten: -1 });
    complete(cdp, 7, { original: 'must not be forwarded' });
    expect(report.mock.calls).toEqual([[{ type: 'completed', programId: program.id, matched: 0, overwritten: 0 }]]);
    await attachment.dispose();
  });

  it('rejects a second live owner, and allows attaching after disposal', async () => {
    const cdp = transport();
    const attachment = await attachPrivacy(cdp, program, vi.fn());
    await expect(attachPrivacy(cdp, program, vi.fn())).rejects.toThrow('already attached');
    await attachment.dispose();
    const next = await attachPrivacy(cdp, program, vi.fn());
    await next.dispose();
  });

  it.each(['Runtime.enable', 'Runtime.addBinding', 'Page.addScriptToEvaluateOnNewDocument', 'Runtime.evaluate'] as const)(
    'cleans up a partial install when %s fails', async (method) => {
      const cdp = transport();
      cdp.respond(method, () => { throw new Error('transport failed'); });
      await expect(attachPrivacy(cdp, program, vi.fn())).rejects.toThrow('transport failed');
      expect(cdp.listenerCount()).toBe(0);
      if (method === 'Runtime.evaluate') expect(cdp.sentMethods()).toContain('Page.removeScriptToEvaluateOnNewDocument');
      if (method === 'Page.addScriptToEvaluateOnNewDocument' || method === 'Runtime.evaluate') {
        expect(cdp.sentMethods()).toContain('Runtime.removeBinding');
      }
    },
  );

  it('reports browser execution exceptions as an installation failure without exposing page content', async () => {
    const cdp = transport();
    const send = cdp.send.bind(cdp);
    cdp.send = (async (method: string, ...params: unknown[]) => {
      if (method === 'Runtime.evaluate' && (params[0] as { expression: string }).expression.includes('globalThis.__uxr_privacy_install__')) {
        return { result: { type: 'undefined' }, exceptionDetails: { text: 'private page content' } };
      }
      return (send as (...args: unknown[]) => Promise<unknown>)(method, ...params);
    }) as typeof cdp.send;
    await expect(attachPrivacy(cdp, program, vi.fn())).rejects.toThrow('Privacy runtime installation failed');
    expect(cdp.listenerCount()).toBe(0);
    expect(cdp.sentMethods()).toContain('Page.removeScriptToEvaluateOnNewDocument');
  });
});
