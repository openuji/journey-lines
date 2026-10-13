import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { keyboardFrame } from '../ui/ClipFilmstrip/clip-filmstrip';
import type { PreviewAnchor } from '../ui/FloatingPreview/floating-preview';

type ActivePreview = Readonly<{ index: number; anchor: PreviewAnchor }>;

/** Own only the transient tooltip and keyboard focus for a filmstrip. */
export function useFilmstripPreview(enabled: boolean, frameCount: number) {
  const frames = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState<ActivePreview | null>(null);
  const previewId = `filmstrip-preview-${useId().replaceAll(':', '')}`;
  const hide = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (!enabled || (active && active.index >= frameCount)) hide();
  }, [active, enabled, frameCount, hide]);

  const show = (index: number, element: HTMLButtonElement): void => {
    if (!enabled) return;
    const { left, right, top, bottom } = element.getBoundingClientRect();
    setActive({ index, anchor: { left, right, top, bottom } });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    const next = keyboardFrame(event.key, index, frameCount - 1);
    if (next === undefined) return;
    event.preventDefault();
    frames.current[next]?.focus();
  };

  return {
    active,
    previewId,
    hide,
    show,
    onKeyDown,
    setFrameRef: (index: number, element: HTMLButtonElement | null) => { frames.current[index] = element; },
  };
}
