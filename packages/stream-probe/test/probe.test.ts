import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import {
  createProbeStream,
  decodeProbePayload,
  PROBE_BINDING_NAME,
  PROBE_SOURCE,
} from '@openuji/stream-probe';
import { PROBE_UNINSTALL } from '@openuji/client-probe';
import { TARGET_TEXT_FIELDS } from '@openuji/core';
import {
  bindingCalled,
  causePayload,
  clickPayload,
  collect,
  pressEndedPayload,
  pressPayload,
  scrollPayload,
} from '../../cdp/test/events.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createProbeStream (standalone)', () => {
  it('installs the binding and the probe — for new documents and the current one', async () => {
    const cdp = createFakeCdpTransport();
    await createProbeStream(cdp);

    expect(cdp.sent).toEqual([
      { method: 'Runtime.enable', params: undefined },
      { method: 'Runtime.addBinding', params: { name: PROBE_BINDING_NAME } },
      { method: 'Page.enable', params: undefined },
      { method: 'Page.getFrameTree', params: undefined },
      { method: 'Performance.enable', params: undefined },
      {
        method: 'Page.addScriptToEvaluateOnNewDocument',
        params: { source: PROBE_SOURCE },
      },
      { method: 'Runtime.evaluate', params: { expression: PROBE_SOURCE } },
    ]);
  });

  it("takes the page's position and scrolling from its session's own frame only; clicks from any", async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'own' } } } as never);
    const { events, stop } = await createProbeStream(cdp);
    const context = (id: number, frameId: string) =>
      cdp.emit('Runtime.executionContextCreated', { context: { id, auxData: { frameId } } });
    const report = (contextId: number, payload: string) =>
      cdp.emit('Runtime.bindingCalled', { name: PROBE_BINDING_NAME, payload, executionContextId: contextId });

    context(1, 'own');
    context(2, 'inner');
    report(2, scrollPayload(50));
    report(2, causePayload('wheel'));
    report(2, clickPayload('a.inner'));
    report(1, scrollPayload(300));
    await stop();

    expect((await collect(events)).map((event) => event.type)).toEqual(['interaction', 'page-scroll']);
  });

  it('decodes probe calls and ignores foreign bindings and malformed payloads', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cdp = createFakeCdpTransport({ startAtMs: 2_000 });
    const { events, stop } = await createProbeStream(cdp);

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

  it('on stop, takes the probe out of the page, then removes the injected script and the binding', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.addScriptToEvaluateOnNewDocument', { identifier: 'script-1' });
    const { events, stop } = await createProbeStream(cdp);

    await stop();

    expect(cdp.sent.slice(-3)).toEqual([
      { method: 'Runtime.evaluate', params: { expression: `window.${PROBE_UNINSTALL}?.()` } },
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

    await expect(createProbeStream(cdp)).rejects.toThrow('target closed');
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

  it.each(['{not json', 'null', '42', '[]'])('rejects %s', (json) => {
    expect(decodeProbePayload(json, 0)).toBeNull();
  });
});

// The page's own scripts can call the binding too: only what the wire
// contract says becomes an event.
describe('decodeProbePayload: takes nothing on trust', () => {
  const target = JSON.parse(clickPayload()).target;
  const at = { pageTimeMs: 1_000 };

  it.each([
    ['an unknown action', { action: 'hover', target, ...at }],
    ["an action from Object's prototype", { action: 'toString', ...at }],
    ['no page time', { action: 'scroll', x: 0, y: 10 }],
    ['a page time that is no number', { action: 'scroll', x: 0, y: 10, pageTimeMs: 'now' }],
    ['a position that is no number', { action: 'scroll', x: 'a', y: 10, ...at }],
    ['a position that is not finite', { action: 'position', x: 0, y: 1e999, ...at }],
    ['a cause not on the list', { action: 'scroll-cause', kind: 'magic', ...at }],
    ['a cause detail that is no text', { action: 'scroll-cause', kind: 'key', detail: 34, ...at }],
    ['a click without a target', { action: 'click', ...at }],
    ['a target without a selector', { action: 'click', target: { ...target, selector: undefined }, ...at }],
    ['a target at a point that is no number', { action: 'click', target: { ...target, clientX: '10' }, ...at }],
    ['a target with a text field that is no text', { action: 'click', target: { ...target, href: {} }, ...at }],
  ])('rejects %s', (_, payload) => {
    expect(decodeProbePayload(JSON.stringify(payload), 0)).toBeNull();
  });

  it.each(TARGET_TEXT_FIELDS)("rejects a target whose '%s' is no text", (field) => {
    const payload = { action: 'click', target: { ...target, [field]: 42 }, ...at };
    expect(decodeProbePayload(JSON.stringify(payload), 0)).toBeNull();
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

describe('createProbeStream: presses, and when inputs happened on Chrome\'s clock', () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const metrics = (navigationStartSeconds: number) => ({
    metrics: [{ name: 'NavigationStart', value: navigationStartSeconds }],
  });
  /** The context the page's own document runs in. */
  const document = (cdp: ReturnType<typeof createFakeCdpTransport>, id: number, frameId = 'own') =>
    cdp.emit('Runtime.executionContextCreated', {
      context: { id, origin: '', name: '', uniqueId: `${id}`, auxData: { frameId, isDefault: true } },
    });
  const times = (events: readonly { type: string; happenedAtMs?: number }[]) =>
    events.map((e) => `${e.type} ${e.happenedAtMs ?? '-'}`);

  it('takes presses from any frame, like clicks', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'own' } } } as never);
    const { events, stop } = await createProbeStream(cdp);

    document(cdp, 2, 'inner');
    bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('t-1', 5), 2);
    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('a.inner', { pressId: 't-1', trusted: true }), 2);
    bindingCalled(cdp, PROBE_BINDING_NAME, pressEndedPayload('t-2'), 2);
    await stop();

    const out = await collect(events);
    expect(out.map((e) => e.type)).toEqual(['press', 'interaction', 'press-ended']);
    expect(out[0]).toMatchObject({ kind: 'pointer', detail: 'mouse', pressId: 't-1' });
    expect(out[1]).toMatchObject({ pressId: 't-1', trusted: true });
  });

  it("puts the page's own documents' inputs on Chrome's clock, never another frame's", async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'own' } } } as never);
    cdp.respond('Performance.getMetrics', metrics(584_000) as never);
    const { events, stop } = await createProbeStream(cdp);

    document(cdp, 1);
    document(cdp, 2, 'inner');
    await settle();
    bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('t-1', 1_500), 1);
    bindingCalled(cdp, PROBE_BINDING_NAME, clickPayload('a', { eventTimeMs: 1_570, pressId: 't-1' }), 1);
    bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('u-1', 900), 2);
    await stop();

    expect(times(await collect(events))).toEqual([
      `press ${584_000_000 + 1_500}`,
      `interaction ${584_000_000 + 1_570}`,
      'press -',
    ]);
  });

  it('says no time for a document whose start is not known yet', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'own' } } } as never);
    cdp.respond('Performance.getMetrics', metrics(584_000) as never);
    const { events, stop } = await createProbeStream(cdp);

    document(cdp, 1);
    bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('t-1', 1_500), 1); // before the answer
    await stop();

    expect(times(await collect(events))).toEqual(['press -']);
  });

  it('keeps no start time that may be another document\'s', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.getFrameTree', { frameTree: { frame: { id: 'own' } } } as never);
    const answers: (() => void)[] = [];
    // Answers held back until the test lets them through.
    cdp.respond('Performance.getMetrics', (() =>
      new Promise((resolve) => answers.push(() => resolve(metrics(584_000))))) as never);
    const { events, stop } = await createProbeStream(cdp);

    document(cdp, 1);
    document(cdp, 3); // the page moved on before the first answer came
    for (const answer of answers) answer();
    await settle();
    bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('t-1', 1_500), 1);
    bindingCalled(cdp, PROBE_BINDING_NAME, pressPayload('v-1', 200), 3);
    await stop();

    expect(times(await collect(events))).toEqual(['press -', `press ${584_000_000 + 200}`]);
  });
});

describe('decodeProbePayload: presses', () => {
  it('decodes a press, with its time on Chrome\'s clock when the host knows its document\'s start', () => {
    expect(decodeProbePayload(pressPayload('t-1', 1_500, 'key', 'Space'), 9, 584_000_000)).toEqual({
      type: 'press',
      kind: 'key',
      detail: 'Space',
      target: JSON.parse(clickPayload()).target,
      pressId: 't-1',
      receivedAtMs: 9,
      pageTimeMs: 1_700_000_000_000,
      happenedAtMs: 584_001_500,
    });
    expect(decodeProbePayload(pressPayload('t-1', 1_500), 9)).not.toHaveProperty('happenedAtMs');
  });

  it('decodes the release of a press, with or without a click', () => {
    expect(decodeProbePayload(pressEndedPayload('t-1'), 9)).toEqual({
      type: 'press-ended',
      pressId: 't-1',
      receivedAtMs: 9,
      pageTimeMs: 1_700_000_000_000,
    });
    expect(decodeProbePayload(JSON.stringify({ action: 'press-ended', pressId: 4, pageTimeMs: 1 }), 0)).toBeNull();
  });

  it('keeps a keyboard press target without inventing pointer coordinates', () => {
    const payload = JSON.parse(pressPayload('key-1', 100, 'key', 'Enter'));
    delete payload.target.clientX;
    delete payload.target.clientY;
    const event = decodeProbePayload(JSON.stringify(payload), 120);
    expect(event).toMatchObject({ type: 'press', kind: 'key', target: { selector: 'a.link' } });
    expect(event?.type === 'press' && event.target).not.toHaveProperty('clientX');
  });

  it.each([
    ['a kind not on the list', { kind: 'tap' }],
    ['a detail that is no text', { detail: 3 }],
    ['no name', { pressId: undefined }],
    ['no event time', { eventTimeMs: undefined }],
    ['no target', { target: undefined }],
    ['an invalid target', { target: { selector: '#gone' } }],
  ])('rejects a press with %s', (_, change) => {
    const payload = { ...JSON.parse(pressPayload('t-1', 1_500)), ...change };
    expect(decodeProbePayload(JSON.stringify(payload), 0)).toBeNull();
  });

  it.each([
    ['a press name that is no text', { pressId: 7 }],
    ['an event time that is no number', { eventTimeMs: 'now' }],
    ['a trust flag that is no flag', { trusted: 'yes' }],
  ])('rejects a click with %s', (_, change) => {
    const payload = { ...JSON.parse(clickPayload()), ...change };
    expect(decodeProbePayload(JSON.stringify(payload), 0)).toBeNull();
  });
});
