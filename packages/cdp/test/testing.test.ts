import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';

describe('createFakeCdpTransport', () => {
  it('has child sessions of their own, on its clock', async () => {
    const cdp = createFakeCdpTransport({ startAtMs: 500 });
    const child = cdp.child('viewer');
    const seen: string[] = [];
    cdp.on('Page.frameNavigated', () => seen.push('tab'));
    child.on('Page.frameNavigated', (_params, { receivedAtMs }) => seen.push(`child at ${receivedAtMs}`));

    cdp.advance(20);
    child.emit('Page.frameNavigated', {});
    await child.send('Page.enable');
    child.dispose();

    expect(cdp.child('viewer')).toBe(child);
    expect(seen).toEqual(['child at 520']);
    expect([cdp.sentMethods(), child.sentMethods()]).toEqual([[], ['Page.enable']]);
    expect(child.disposed).toBe(true);
  });
});
