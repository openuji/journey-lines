import { describe, expect, it, vi } from 'vitest';
import { createCdpEventRouter } from '../src/router.js';
import { createManualClock } from '../src/testing.js';
import type { Clock } from '../src/transport.js';

/** A clock read through `now`; these tests set no timers. */
const reading = (now: () => number): Clock => ({ now, at: () => () => {} });

describe('createCdpEventRouter', () => {
  it('delivers each event only to listeners of its method, in registration order', () => {
    const router = createCdpEventRouter();
    const seen: string[] = [];

    router.on('Page.lifecycleEvent', () => seen.push('lifecycle-1'));
    router.on('Page.screencastFrame', () => seen.push('frame'));
    router.on('Page.lifecycleEvent', () => seen.push('lifecycle-2'));

    router.dispatch('Page.lifecycleEvent', {});
    router.dispatch('Page.screencastFrame', {});
    router.dispatch('Runtime.bindingCalled', {});

    expect(seen).toEqual(['lifecycle-1', 'lifecycle-2', 'frame']);
  });

  it('stops delivering after unsubscribe', () => {
    const router = createCdpEventRouter({ clock: createManualClock(7) });
    const listener = vi.fn();

    const off = router.on('Page.screencastFrame', listener);
    router.dispatch('Page.screencastFrame', { n: 1 });
    off();
    router.dispatch('Page.screencastFrame', { n: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ n: 1 }, { receivedAtMs: 7 });
    expect(router.listenerCount()).toBe(0);
  });

  it('stamps each event once, and every listener sees that stamp', () => {
    let time = 100;
    const router = createCdpEventRouter({ clock: reading(() => time++) });
    const stamps: number[] = [];

    router.on('Page.lifecycleEvent', (_, { receivedAtMs }) => stamps.push(receivedAtMs));
    router.on('Page.lifecycleEvent', (_, { receivedAtMs }) => stamps.push(receivedAtMs));
    router.dispatch('Page.lifecycleEvent', {});
    router.dispatch('Page.lifecycleEvent', {});

    expect(stamps).toEqual([100, 100, 101, 101]);
  });

  it('reads no clock for an event nobody listens to', () => {
    const now = vi.fn(() => 0);
    const router = createCdpEventRouter({ clock: reading(now) });

    router.dispatch('Page.screencastFrame', {});

    expect(now).not.toHaveBeenCalled();
  });

  it('delivers the in-flight event to a listener unsubscribed mid-dispatch', () => {
    const router = createCdpEventRouter();
    const second = vi.fn();

    let offSecond = (): void => {};
    router.on('Page.screencastFrame', () => offSecond());
    offSecond = router.on('Page.screencastFrame', second);

    router.dispatch('Page.screencastFrame', {});
    router.dispatch('Page.screencastFrame', {});

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener from its siblings', () => {
    const onListenerError = vi.fn();
    const router = createCdpEventRouter({ onListenerError });
    const sibling = vi.fn();
    const boom = new Error('boom');

    router.on('Page.screencastFrame', () => {
      throw boom;
    });
    router.on('Page.screencastFrame', sibling);

    router.dispatch('Page.screencastFrame', {});

    expect(sibling).toHaveBeenCalledTimes(1);
    expect(onListenerError).toHaveBeenCalledWith(boom, 'Page.screencastFrame');
  });
});
