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

  it('reports Chrome ending the session once, with the reason', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const target = await attachTab(chromeDebugger, TAB);
    const closed = vi.fn();
    target.onClosed(closed);

    chromeDebugger.endSession(TAB + 1, 'target_closed');
    expect(closed).not.toHaveBeenCalled();

    chromeDebugger.endSession(TAB, 'canceled_by_user');
    chromeDebugger.endSession(TAB, 'canceled_by_user');
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith('canceled_by_user');
  });

  it('hands the tab back at its own scale factor, then detaches', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const target = await attachTab(chromeDebugger, TAB);

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
