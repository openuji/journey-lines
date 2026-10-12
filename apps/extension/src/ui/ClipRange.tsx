import type { Clip } from '@openuji/core';
import type { CSSProperties } from 'react';
import { ClipFrameVideo } from './ClipFrameVideo';
import { FloatingPreview } from './FloatingPreview';
import { frameSeekTime, frameTimeLabel, RANGE_THUMB_PX } from './clip-range';
import { useRangePreview } from './useRangePreview';

function RecordedRange({ clip }: Readonly<{ clip: Clip }>) {
  const { rangeRef, previewId, anchor, selected, atMs, endMs, hide, rangeProps } = useRangePreview(clip.trace);
  const style: CSSProperties & Readonly<{ '--range-progress': string; '--range-thumb-size': string }> = {
    '--range-progress': `${(atMs / Math.max(1, endMs)) * 100}%`,
    '--range-thumb-size': `${RANGE_THUMB_PX}px`,
  };
  return (
    <div className="clip-range">
      <input
        {...rangeProps}
        ref={rangeRef}
        type="range"
        min={0}
        max={endMs}
        step="any"
        value={atMs}
        style={style}
        aria-label="Preview transition frames"
        aria-valuetext={`Frame ${selected + 1} of ${clip.trace.length}, ${frameTimeLabel(atMs)}`}
        aria-describedby={anchor ? previewId : undefined}
      />
      <span className="clip-range__duration">{frameTimeLabel(endMs)}</span>
      {anchor && (
        <FloatingPreview id={previewId} anchor={anchor} onDismiss={hide}>
          <ClipFrameVideo clip={clip} seconds={frameSeekTime(clip.trace, selected)} />
          <span className="floating-preview__caption">{frameTimeLabel(atMs)}</span>
        </FloatingPreview>
      )}
    </div>
  );
}

/** Without recorded motion, the connector stays passive. */
export function ClipRange({ clip }: Readonly<{ clip?: Clip }>) {
  return clip && clip.trace.length > 1
    ? <RecordedRange clip={clip} />
    : <span className="clip-range__connector" aria-hidden />;
}
