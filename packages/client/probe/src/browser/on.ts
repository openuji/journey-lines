const OPTIONS = { capture: true, passive: true } as const;

/**
 * Listens on `window` in the capture phase, so a page stopping propagation
 * can't hide an event from the probe, and `window` exists before
 * `document.documentElement` does. Returns how to stop.
 */
export function on<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
): () => void {
  window.addEventListener(type, listener, OPTIONS);
  return () => window.removeEventListener(type, listener, OPTIONS);
}
