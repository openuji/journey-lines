import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { previewPlacement, type PreviewAnchor } from './clip-range';

export type FloatingPreviewProps = Readonly<{
  id: string;
  anchor: PreviewAnchor;
  onDismiss: () => void;
  children: ReactNode;
}>;

/** Portaled so a scrolling timeline cannot clip the preview. */
export function FloatingPreview({ id, anchor, onDismiss, children }: FloatingPreviewProps) {
  useEffect(() => {
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onDismiss]);
  const placement = previewPlacement(anchor, { width: window.innerWidth, height: window.innerHeight });
  return createPortal(
    <div id={id} className="floating-preview" role="tooltip" style={placement}>{children}</div>,
    document.body,
  );
}
