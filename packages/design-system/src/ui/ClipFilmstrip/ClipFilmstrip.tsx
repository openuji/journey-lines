import { useClipStills } from '../../hooks/useClipStills';
import { useFilmstripPreview } from '../../hooks/useFilmstripPreview';
import type { PlayableClip } from '../../lib/playable-clip';
import { FloatingPreview } from '../FloatingPreview/FloatingPreview';
import { FILMSTRIP_STILL_WIDTH, frameSeekTime, frameTimeLabel, sampledFrames } from './clip-filmstrip';
import styles from './ClipFilmstrip.module.css';

export type ClipFilmstripProps = Readonly<{
  clip: PlayableClip;
  previewEnabled: boolean;
}>;

/**
 * A few small stills of a clip, fading the way the transition reads, at full
 * strength while pointed at. Hovering one shows it large. It never represents
 * playback progress.
 */
export function ClipFilmstrip({ clip, previewEnabled }: ClipFilmstripProps) {
  const frames = sampledFrames(clip.trace);
  const { ref, status, stills } = useClipStills(
    clip.src,
    frames.map(({ traceIndex }) => frameSeekTime(clip.trace, traceIndex)),
    FILMSTRIP_STILL_WIDTH,
  );
  const { active, previewId, hide, show, onKeyDown, setFrameRef } = useFilmstripPreview(previewEnabled, frames.length);
  const previewed = active ? frames[active.index] : undefined;
  const previewedStill = active ? stills[active.index] : undefined;

  if (frames.length === 0) return null;

  return (
    <>
      <div ref={ref} className={styles['clip-filmstrip']} role="group" aria-label="Recorded transition frames">
        {frames.map(({ sample }, index) => (
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
            {stills[index] && <img src={stills[index]} alt="" />}
          </button>
        ))}
      </div>
      {previewEnabled && active && previewed && (
        <FloatingPreview id={previewId} anchor={active.anchor} onDismiss={hide} caption={frameTimeLabel(previewed.sample.atMs)}>
          {previewedStill
            ? <img className={styles['clip-filmstrip__preview']} src={previewedStill} alt="" />
            : <span className={styles['clip-filmstrip__status']} role="status">{status === 'failed' ? 'Frame unavailable' : 'Loading frame…'}</span>}
        </FloatingPreview>
      )}
    </>
  );
}
