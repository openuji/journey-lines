import { useCallback, useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import type { ClipTraceSample } from '@openuji/core';
import { frameIndexAt, keyboardFrame, rangeTimeAt, RANGE_THUMB_PX, type PreviewAnchor } from './clip-range';

/** Local interaction state only; frame and geometry calculations remain pure. */
export function useRangePreview(trace: readonly ClipTraceSample[]) {
  const rangeRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<PreviewAnchor | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const previewId = `range-preview-${useId().replaceAll(':', '')}`;
  const last = trace.length - 1;
  const selected = Math.min(index, last);
  const endMs = trace[last]!.atMs;
  const atMs = trace[selected]!.atMs;
  const hide = useCallback(() => setAnchor(null), []);

  const showAt = (time: number, clientX?: number): void => {
    const element = rangeRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const next = frameIndexAt(trace, time);
    const x = clientX ?? rect.left + RANGE_THUMB_PX / 2 + (trace[next]!.atMs / Math.max(1, endMs)) * (rect.width - RANGE_THUMB_PX);
    setIndex(next);
    setAnchor({ left: x, right: x, top: rect.top, bottom: rect.bottom });
  };

  const showPointer = (event: PointerEvent<HTMLInputElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Native slider endpoints are the thumb centres, inside the input bounds.
    showAt(rangeTimeAt(event.clientX, rect.left + RANGE_THUMB_PX / 2, rect.width - RANGE_THUMB_PX, endMs), event.clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(true);
      hide();
      return;
    }
    const next = keyboardFrame(event.key, selected, last);
    if (next === undefined) return;
    event.preventDefault();
    setDismissed(false);
    showAt(trace[next]!.atMs);
  };

  return {
    rangeRef, previewId, anchor, selected, atMs, endMs, hide,
    rangeProps: {
      onKeyDown,
      onFocus: () => { setDismissed(false); showAt(atMs); },
      onBlur: hide,
      onPointerEnter: (event: PointerEvent<HTMLInputElement>) => { setDismissed(false); showPointer(event); },
      onPointerMove: (event: PointerEvent<HTMLInputElement>) => { if (!dismissed) showPointer(event); },
      onPointerLeave: () => { setDismissed(false); hide(); },
      onChange: (event: ChangeEvent<HTMLInputElement>) => { setDismissed(false); showAt(Number(event.currentTarget.value)); },
    },
  };
}
