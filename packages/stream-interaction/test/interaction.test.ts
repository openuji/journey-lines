import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import {
  createInteractionStream,
  decodeProbePayload,
  PROBE_BINDING_NAME,
  PROBE_SOURCE,
} from '@openuji/stream-interaction';
import {
  bindingCalled,
  clickPayload,
  collect,
} from '../../cdp/test/events.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createInteractionStream (standalone)', () => {
  it('installs the binding and the probe — for new documents and the current one', async () => {
    const cdp = createFakeCdpTransport();
    await createInteractionStream(cdp);

    expect(cdp.sent).toEqual([
      { method: 'Runtime.enable', params: undefined },
      { method: 'Runtime.addBinding', params: { name: PROBE_BINDING_NAME } },
      { method: 'Page.enable', params: undefined },
      {
        method: 'Page.addScriptToEvaluateOnNewDocument',
        params: { source: PROBE_SOURCE },
      },
      { method: 'Runtime.evaluate', params: { expression: PROBE_SOURCE } },
    ]);
  });

  it('decodes probe calls and ignores foreign bindings and malformed payloads', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cdp = createFakeCdpTransport({ startAtMs: 2_000 });
    const { events, stop } = await createInteractionStream(cdp);

    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('button#go'));
    bindingCalled(cdp, 'somebody_elses_binding', clickPayload('a.other'));
    bindingCalled(cdp, PROBE_BINDING_NAME, '{not json');
    await stop();

    const out = await collect(events);
    expect(out.map((e) => (e.type === 'interaction' ? [e.action, e.target.selector] : e.type))).toEqual([
      ['click', 'button#go'],
    ]);
    expect(out[0]).toMatchObject({
      receivedAtMs: 2_000,
      pageTimeMs: 1_700_000_000_000,
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('removes the injected script and the binding on stop', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.addScriptToEvaluateOnNewDocument', { identifier: 'script-1' });
    const { events, stop } = await createInteractionStream(cdp);

    await stop();

    expect(cdp.sent.slice(-2)).toEqual([
      {
        method: 'Page.removeScriptToEvaluateOnNewDocument',
        params: { identifier: 'script-1' },
      },
      { method: 'Runtime.removeBinding', params: { name: PROBE_BINDING_NAME } },
    ]);
    expect(cdp.listenerCount()).toBe(0);
    expect(await collect(events)).toEqual([]);
  });

  it('cleans up after itself when injection fails', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.addScriptToEvaluateOnNewDocument', () => {
      throw new Error('target closed');
    });

    await expect(createInteractionStream(cdp)).rejects.toThrow('target closed');
    expect(cdp.listenerCount()).toBe(0);
    expect(cdp.sentMethods()).toContain('Runtime.removeBinding');
  });
});

describe('decodeProbePayload', () => {
  it('decodes a wire payload, keeping the page clock apart from receipt time', () => {
    expect(decodeProbePayload(clickPayload('a.link'), 42)).toMatchObject({
      action: 'click',
      target: { selector: 'a.link' },
      receivedAtMs: 42,
      pageTimeMs: 1_700_000_000_000,
    });
  });

  it.each(['{not json', 'null', '42'])('rejects %s', (json) => {
    expect(decodeProbePayload(json, 0)).toBeNull();
  });
});

describe('decodeProbePayload: the page scrolling', () => {
  it("decodes where the page is, its scrolls and its scrollend", () => {
    const at = (action: string, y: number) => JSON.stringify({ action, x: 0, y, pageTimeMs: 1_000 });

    expect(decodeProbePayload(at('position', 0), 5)).toEqual({ type: 'page-position', x: 0, y: 0, receivedAtMs: 5, pageTimeMs: 1_000 });
    expect(decodeProbePayload(at('scroll', 120), 6)).toEqual({ type: 'page-scroll', ended: false, x: 0, y: 120, receivedAtMs: 6, pageTimeMs: 1_000 });
    expect(decodeProbePayload(at('scrollend', 300), 7)).toEqual({ type: 'page-scroll', ended: true, x: 0, y: 300, receivedAtMs: 7, pageTimeMs: 1_000 });
    expect(decodeProbePayload(JSON.stringify({ action: 'scroll-cause', kind: 'key', detail: 'PageDown', pageTimeMs: 1_000 }), 8)).toEqual({
      type: 'scroll-cause',
      kind: 'key',
      detail: 'PageDown',
      receivedAtMs: 8,
      pageTimeMs: 1_000,
    });
  });
});
