import { describe, expect, it } from 'vitest';
import { createChromeDebuggerTransport } from '../src/transport.js';
import { createFakeChromeDebugger } from './fake-debugger.js';

const TAB = 7;

describe('createChromeDebuggerTransport', () => {
  it('delivers its own tab’s events in arrival order', () => {
    const chromeDebugger = createFakeChromeDebugger();
    const cdp = createChromeDebuggerTransport(chromeDebugger, TAB);
    const seen: string[] = [];

    cdp.on('Page.lifecycleEvent', ({ name }) => seen.push(name));
    cdp.on('Page.screencastFrame', ({ sessionId }) => seen.push(`frame ${sessionId}`));

    chromeDebugger.emit({ tabId: TAB }, 'Page.lifecycleEvent', { name: 'load' });
    chromeDebugger.emit({ tabId: TAB }, 'Page.screencastFrame', { sessionId: 1 });
    chromeDebugger.emit({ tabId: TAB }, 'Page.lifecycleEvent', { name: 'networkAlmostIdle' });

    expect(seen).toEqual(['load', 'frame 1', 'networkAlmostIdle']);
  });

  it('ignores other tabs and child sessions', () => {
    const chromeDebugger = createFakeChromeDebugger();
    const cdp = createChromeDebuggerTransport(chromeDebugger, TAB);
    const seen: string[] = [];

    cdp.on('Page.lifecycleEvent', ({ name }) => seen.push(name));

    chromeDebugger.emit({ tabId: TAB + 1 }, 'Page.lifecycleEvent', { name: 'other tab' });
    chromeDebugger.emit({ tabId: TAB, sessionId: 'iframe' }, 'Page.lifecycleEvent', {
      name: 'child session',
    });
    chromeDebugger.emit({ tabId: TAB }, 'Page.lifecycleEvent', { name: 'ours' });

    expect(seen).toEqual(['ours']);
  });

  it('sends commands to its tab', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const cdp = createChromeDebuggerTransport(chromeDebugger, TAB);

    await cdp.send('Page.navigate', { url: 'https://example.com/' });

    expect(chromeDebugger.sent).toEqual([
      { tabId: TAB, method: 'Page.navigate', params: { url: 'https://example.com/' } },
    ]);
  });

  it('stops listening to chrome.debugger once disposed', () => {
    const chromeDebugger = createFakeChromeDebugger();
    const cdp = createChromeDebuggerTransport(chromeDebugger, TAB);
    expect(chromeDebugger.listenerCount()).toBe(1);

    cdp.dispose();

    expect(chromeDebugger.listenerCount()).toBe(0);
  });

  it('refuses to send once disposed, without asking Chrome: commands go by tab', async () => {
    const chromeDebugger = createFakeChromeDebugger();
    const cdp = createChromeDebuggerTransport(chromeDebugger, TAB);

    cdp.dispose();

    await expect(cdp.send('Page.enable')).rejects.toThrow(`tab ${TAB} has ended`);
    expect(chromeDebugger.sent).toEqual([]);
  });
});
