import type { CDPSession } from 'puppeteer';
import {
  createCdpEventRouter,
  type CdpTransport,
  type Unsubscribe,
} from '@openuji/cdp';

type Forwarder = (params: unknown) => void;

/**
 * `CdpTransport` over a Puppeteer `CDPSession`.
 *
 * The session emits each CDP event under its method name, so the first
 * listener for a method installs one forwarder into the shared router — the
 * same path the extension and Electron hosts take — and ordering and listener
 * isolation behave identically on every host. Order holds because the session
 * emits every message synchronously, in arrival order; that stops being true
 * under `slowMo`, so never launch with it.
 *
 * Puppeteer types CDP against its own protocol snapshot; this adapter is the
 * one place the two meet, so the casts live here.
 */
export function createPuppeteerTransport(
  session: CDPSession,
): CdpTransport & { dispose: Unsubscribe } {
  const router = createCdpEventRouter();
  const forwarders = new Map<string, Forwarder>();

  const emitter = session as unknown as {
    on(method: string, handler: Forwarder): void;
    off(method: string, handler: Forwarder): void;
  };

  const on: CdpTransport['on'] = (event, listener) => {
    if (!forwarders.has(event)) {
      const forward: Forwarder = (params) => router.dispatch(event, params);
      forwarders.set(event, forward);
      emitter.on(event, forward);
    }
    return router.on(event, listener);
  };

  const send = (method: string, params?: object): Promise<unknown> =>
    (session.send as (method: string, params?: object) => Promise<unknown>)(
      method,
      params,
    );

  // Puppeteer opens a `CDPSession` for every session Chrome attaches through
  // this one, on the same connection.
  const child = (sessionId: string): CdpTransport & { dispose: Unsubscribe } => {
    const childSession = session.connection()?.session(sessionId);
    if (!childSession) throw new Error(`No CDP session ${sessionId}`);
    return createPuppeteerTransport(childSession);
  };

  return {
    send: send as CdpTransport['send'],
    on,
    clock: router.clock,
    child,
    dispose: () => {
      for (const [method, forward] of forwarders) emitter.off(method, forward);
      forwarders.clear();
    },
  };
}
