import { describe, expect, it } from 'vitest';
import { createFakeCdpTransport } from '@openuji/cdp/testing';
import { frameNavigated } from './events.js';
import { navigateAndCommit, navigateUntilClosed } from '../src/navigate.js';

const URL = 'https://example.com/next';

/** Let pending promise callbacks run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Starts a navigation and reports whether it has resolved yet. */
function track(promise: Promise<void>): { readonly done: boolean } {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
}

describe('navigateAndCommit', () => {
  it('waits past the reply for the commit of the document it started', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.navigate', { frameId: 'main', loaderId: 'next' });

    const navigation = navigateAndCommit(cdp, URL);
    const state = track(navigation);
    await settle();
    expect(state.done).toBe(false);

    // Neither a subframe nor some other document's commit is this navigation.
    frameNavigated(cdp, 'next', { frameId: 'ad', parentId: 'main' });
    frameNavigated(cdp, 'other');
    await settle();
    expect(state.done).toBe(false);

    frameNavigated(cdp, 'next');
    await navigation;
    expect(cdp.sentMethods()).toEqual(['Page.enable', 'Page.navigate']);
    expect(cdp.listenerCount('Page.frameNavigated')).toBe(0);
  });

  it('resolves on the reply when the commit arrived ahead of it', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.navigate', () => {
      frameNavigated(cdp, 'next');
      return { frameId: 'main', loaderId: 'next' };
    });

    await navigateAndCommit(cdp, URL);
    expect(cdp.listenerCount('Page.frameNavigated')).toBe(0);
  });

  it('resolves on the reply for a same-document navigation', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.navigate', { frameId: 'main' });

    await navigateAndCommit(cdp, `${URL}#section`);
    expect(cdp.listenerCount('Page.frameNavigated')).toBe(0);
  });

  it('rejects a download, which Chrome reports as an aborted navigation', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.navigate', {
      frameId: 'main',
      loaderId: 'file',
      errorText: 'net::ERR_ABORTED',
      isDownload: true,
    });

    await expect(navigateAndCommit(cdp, `${URL}.zip`)).rejects.toThrow('net::ERR_ABORTED');
    expect(cdp.listenerCount('Page.frameNavigated')).toBe(0);
  });

  it('rejects a failed navigation and stops listening', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.navigate', {
      frameId: 'main',
      loaderId: 'next',
      errorText: 'net::ERR_NAME_NOT_RESOLVED',
    });

    await expect(navigateAndCommit(cdp, URL)).rejects.toThrow(
      `Navigation to ${URL} failed: net::ERR_NAME_NOT_RESOLVED`,
    );
    expect(cdp.listenerCount('Page.frameNavigated')).toBe(0);
  });
});

describe('navigateUntilClosed', () => {
  it('gives up a navigation that never commits once the target goes away', async () => {
    const cdp = createFakeCdpTransport();
    cdp.respond('Page.navigate', { frameId: 'main', loaderId: 'next' });

    let close = (): void => {};
    let watching = false;
    const onClosed = (listener: () => void) => {
      close = listener;
      watching = true;
      return () => {
        watching = false;
      };
    };

    const navigation = navigateUntilClosed(cdp, URL, onClosed);
    await settle();
    close();

    await expect(navigation).rejects.toThrow(`Target closed while navigating to ${URL}`);
    expect(watching).toBe(false);
  });
});
