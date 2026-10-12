import type { Clip } from '@openuji/core';
import { useClipSource } from '../../hooks/useClipSource';
import { useFilmstripPreview } from '../../hooks/useFilmstripPreview';
import { ClipFrameVideo } from '../ClipFrameVideo/ClipFrameVideo';
import { FloatingPreview } from '../FloatingPreview/FloatingPreview';
import { frameSeekTime, frameTimeLabel, sampledFrames } from './clip-filmstrip';
import styles from './ClipFilmstrip.module.css';

export type ClipFilmstripProps = Readonly<{
  clip: Clip;
  previewEnabled: boolean;
}>;

/** A bounded visual summary of a clip; it never represents playback progress. */
export function ClipFilmstrip({ clip, previewEnabled }: ClipFilmstripProps) {
  const source = useClipSource(clip);
  const frames = sampledFrames(clip.trace);
  const { active, previewId, hide, show, onKeyDown, setFrameRef } = useFilmstripPreview(previewEnabled, frames.length);
  const previewedFrame = active ? frames[active.index] : undefined;

  if (frames.length === 0) return null;

  return (
    <>
      <div className={styles['clip-filmstrip']} role="group" aria-label="Recorded transition frames">
        {frames.map(({ traceIndex, sample }, index) => (
          <button
            key={`${sample.frameIndex}:${sample.atMs}`}
            ref={(element) => setFrameRef(index, element)}
            type="button"
            className={styles['clip-filmstrip__frame']}
            disabled={!previewEnabled}
            aria-label={`Preview recorded frame ${index + 1} of ${frames.length}, ${frameTimeLabel(sample.atMs)}`}
            aria-describedby={active?.index === index ? previewId : undefined}
            data-frame-index={sample.frameIndex}
            data-frame-time={sample.atMs}
            onPointerEnter={(event) => show(index, event.currentTarget)}
            onPointerLeave={hide}
            onFocus={(event) => show(index, event.currentTarget)}
            onBlur={hide}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <ClipFrameVideo source={source} seconds={frameSeekTime(clip.trace, traceIndex)} announceStatus={false} />
          </button>
        ))}
      </div>
      {previewEnabled && active && previewedFrame && (
        <FloatingPreview
          id={previewId}
          anchor={active.anchor}
          onDismiss={hide}
          caption={frameTimeLabel(previewedFrame.sample.atMs)}
        >
          <ClipFrameVideo source={source} seconds={frameSeekTime(clip.trace, previewedFrame.traceIndex)} />
        </FloatingPreview>
      )}
    </>
  );
}
