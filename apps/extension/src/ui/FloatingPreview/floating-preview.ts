export type PreviewAnchor = Readonly<{ left: number; right: number; top: number; bottom: number }>;
export type PreviewViewport = Readonly<{ width: number; height: number }>;
export type PreviewSize = Readonly<{ width: number; height: number; margin: number }>;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Prefer above the anchor; keep every edge inside the current viewport. */
export function previewPlacement(anchor: PreviewAnchor, viewport: PreviewViewport, size: PreviewSize) {
  const { margin } = size;
  const width = Math.max(1, Math.min(size.width, viewport.width - margin * 2));
  const height = Math.max(1, Math.min(size.height, viewport.height - margin * 2));
  const above = anchor.top - height - margin;
  const preferredTop = above >= margin ? above : anchor.bottom + margin;
  return {
    width,
    height,
    left: clamp((anchor.left + anchor.right - width) / 2, margin, Math.max(margin, viewport.width - width - margin)),
    top: clamp(preferredTop, margin, Math.max(margin, viewport.height - height - margin)),
  };
}
