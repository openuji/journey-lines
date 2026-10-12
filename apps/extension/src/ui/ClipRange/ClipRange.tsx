import type { Clip } from '@openuji/core';
import type { CSSProperties } from 'react';
import { ClipFrameVideo } from '../ClipFrameVideo/ClipFrameVideo';
import { FloatingPreview } from '../FloatingPreview/FloatingPreview';
import { frameSeekTime, frameTimeLabel } from './clip-range';
import { useRangePreview } from '../../hooks/useRangePreview';
import rangeStyles from './ClipRange.module.css';

function RecordedRange({ clip }: Readonly<{ clip: Clip }>) {
  const { rangeRef, previewId, anchor, selected, atMs, endMs, hide, rangeProps } = useRangePreview(clip.trace);
  const style: CSSProperties & Readonly<{ '--range-progress': string }> = {
    '--range-progress': `${(atMs / Math.max(1, endMs)) * 100}%`,
  };
  return (
    <div className={rangeStyles['clip-range']}>
      <span className={rangeStyles['clip-range__duration']}>{frameTimeLabel(endMs)}</span>
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
      
      {anchor && (
        <FloatingPreview id={previewId} anchor={anchor} onDismiss={hide} caption={frameTimeLabel(atMs)}>
          <ClipFrameVideo clip={clip} seconds={frameSeekTime(clip.trace, selected)} />
        </FloatingPreview>
      )}
    </div>
  );
}

/** Without recorded motion, the connector stays passive. */
export function ClipRange({ clip }: Readonly<{ clip?: Clip }>) {
  return clip && clip.trace.length > 1
    ? <RecordedRange clip={clip} />
    : <span className={rangeStyles['clip-range__connector']} aria-hidden />;
}
