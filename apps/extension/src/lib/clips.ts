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
import { clipSinkOver, type Channel, type ClipWorker, type FromEncoder, type ToEncoder } from '@openuji/clip-webm';

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

/**
 * The video encoder for one recording: an offscreen document starts it in a
 * worker, and the clip sink's recorder side talks to it over the clip channel.
 * `close` ends both.
 */
export async function openClips(onClip: (clip: Clip) => void): Promise<ClipWorker> {
  // A document left over from a recording the worker did not see end.
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();

  const ready = new Promise<void>((resolve, reject) => {
    const settle = (error?: string): void => {
      chrome.runtime.onMessage.removeListener(listener);
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve();
    };
    const listener = (message: ClipsReady): void => {
      if (message?.type === CLIPS_READY) settle(message.error);
    };
    // Never wait forever: a recording that cannot make videos says so.
    const timer = setTimeout(() => settle('The video encoder did not start within 15 s'), 15_000);
    chrome.runtime.onMessage.addListener(listener);
  });
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Encodes a video of each scroll and click in a worker.',
  });
  await ready;

  const channel = clipChannel<FromEncoder, ToEncoder>();
  return {
    sink: clipSinkOver(channel, onClip),
    close: async () => {
      channel.close();
      await chrome.offscreen.closeDocument();
    },
  };
}
