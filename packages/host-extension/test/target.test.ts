import { describe, expect, it, vi } from 'vitest';
import { attachTab } from '../src/target.js';
import { createFakeChromeDebugger } from './fake-debugger.js';

const TAB = 7;

describe('attachTab', () => {
  it('attaches, then pins the scale factor before handing the tab over', async () => {
    const chromeDebugger = createFakeChromeDebugger();

    const target = await attachTab(chromeDebugger, TAB);

    expect(target.tabId).toBe(TAB);
    expect(target.viewport).toBeUndefined();
    expect(chromeDebugger.calls).toEqual([
      `attach ${TAB} 1.3`,
      'Emulation.setDeviceMetricsOverride',
    ]);
    expect(chromeDebugger.sent[0]?.params).toEqual({
      width: 0,
      height: 0,
      deviceScaleFactor: 1,
      mobile: false,
    });
  });

  it('explains why Chrome refused to attach, keeping its own message', async () => {
    const chromeDebugger = createFakeChromeDebugger();

    chromeDebugger.failAttach('Another debugger is already attached to the tab with id: 7.');
    await expect(attachTab(chromeDebugger, TAB)).rejects.toThrow(
      /Close DevTools on it and try again\. \(Another debugger is already attached/,
    );

    chromeDebugger.failAttach('Cannot access a chrome:// URL');
    await expect(attachTab(chromeDebugger, TAB)).rejects.toThrow(
      /does not let extensions record this page.*\(Cannot access a chrome:\/\/ URL\)/,
    );
  });

  it('detaches again when the scale factor cannot be pinned', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    chromeDebugger.failCommand('Emulation.setDeviceMetricsOverride', 'boom');

    await expect(attachTab(chromeDebugger, TAB)).rejects.toThrow('boom');

    expect(chromeDebugger.calls.at(-1)).toBe(`detach ${TAB}`);
    expect(chromeDebugger.listenerCount()).toBe(0);
  });

  it('reports Chrome ending the session once: Cancel as revoked, anything else as lost', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const cancelled = await attachTab(chromeDebugger, TAB);
    const revoked = vi.fn();
    cancelled.onClosed(revoked);

    chromeDebugger.endSession(TAB + 1, 'target_closed');
    expect(revoked).not.toHaveBeenCalled();

    chromeDebugger.endSession(TAB, 'canceled_by_user');
    chromeDebugger.endSession(TAB, 'canceled_by_user');
    expect(revoked).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledWith('revoked');

    // Chrome's PDF viewer: the tab stays, the session goes, as `target_closed`.
    const pdf = await attachTab(chromeDebugger, TAB);
    const lost = vi.fn();
    pdf.onClosed(lost);
    chromeDebugger.endSession(TAB, 'target_closed');
    expect(lost).toHaveBeenCalledWith('lost');
  });

  it('never touches the tab again once Chrome ended its session: a newer one may own it', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const target = await attachTab(chromeDebugger, TAB);
    const heard = vi.fn();
    target.cdp.on('Page.lifecycleEvent', heard);
    chromeDebugger.endSession(TAB, 'target_closed');
    const callsBefore = chromeDebugger.calls.length;

    await expect(target.cdp.send('Page.enable')).rejects.toThrow('has ended');
    chromeDebugger.emit({ tabId: TAB }, 'Page.lifecycleEvent', { name: 'load' });
    await target.close();

    expect(heard).not.toHaveBeenCalled();
    expect(chromeDebugger.calls.length).toBe(callsBefore); // no command, no clear, no detach
    expect(chromeDebugger.listenerCount()).toBe(0);
  });

  it('hands the tab back at its own scale factor, then detaches', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const target = await attachTab(chromeDebugger, TAB);
    target.onClosed(() => {});

    await target.close();

    expect(chromeDebugger.calls.slice(-2)).toEqual([
      'Emulation.clearDeviceMetricsOverride',
      `detach ${TAB}`,
    ]);
    expect(chromeDebugger.listenerCount()).toBe(0);
  });

  it('still detaches when the session already ended', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const target = await attachTab(chromeDebugger, TAB);
    chromeDebugger.failCommand('Emulation.clearDeviceMetricsOverride', 'Debugger is not attached');

    await target.close();

    expect(chromeDebugger.calls.at(-1)).toBe(`detach ${TAB}`);
  });
});
