import { CLIPS_READY, type ClipsReady } from '../../lib/clips';

/**
 * The offscreen document hosts the video encoder's worker, because a service
 * worker cannot start one. It relays nothing: the worker and the service
 * worker talk over the clip channel. It only says when the encoder is ready.
 */
const worker = new Worker(new URL('./clip-worker.ts', import.meta.url), { type: 'module' });

const tell = (message: ClipsReady): void => void chrome.runtime.sendMessage(message);

worker.addEventListener('message', (event: MessageEvent<{ ready: boolean; error?: string }>) => {
  const { ready, error } = event.data;
  tell(ready ? { type: CLIPS_READY } : { type: CLIPS_READY, error: error ?? 'The video encoder failed to start' });
});
worker.addEventListener('error', (event) => {
  tell({ type: CLIPS_READY, error: event.message || 'The video encoder failed to start' });
});
