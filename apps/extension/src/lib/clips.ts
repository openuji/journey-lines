/**
 * The extension's clip channel: how the recorder side of the clip sink (in the
 * service worker) reaches the encoder (a dedicated worker the offscreen
 * document starts; a service worker cannot start one).
 *
 * A BroadcastChannel joins them directly, with no relay through the document.
 * Measured on Chrome 154 (2026-10-07) with real 460 KB frames at 60 fps, a
 * send blocks the service worker 0.2–0.3 ms; over a `chrome.runtime` port,
 * which serializes JSON and needs the document to relay, 0.9–1.2 ms.
 */

import type { Clip } from '@openuji/core';
import type { Channel, ClipWorker } from '@openuji/clip-webm';

export const CLIPS_CHANNEL = 'openuji-clips';

/** What the offscreen document tells the service worker once the encoder is loaded. */
export const CLIPS_READY = 'clips-ready';
export type ClipsReady = Readonly<{ type: typeof CLIPS_READY; error?: string }>;

/** Starts the encoder for one recording; each finished clip goes to `onClip`. */
export type OpenClips = (onClip: (clip: Clip) => void) => Promise<ClipWorker>;

/**
 * One end of the clip channel. A BroadcastChannel never hears its own
 * messages, so each end hears only the other.
 */
export function clipChannel<In, Out>(): Channel<In, Out> & { close(): void } {
  const channel = new BroadcastChannel(CLIPS_CHANNEL);
  return {
    post: (message) => channel.postMessage(message),
    listen: (on) => {
      const handler = (event: Event): void => on((event as MessageEvent).data as In);
      channel.addEventListener('message', handler);
      return () => channel.removeEventListener('message', handler);
    },
    close: () => channel.close(),
  };
}
