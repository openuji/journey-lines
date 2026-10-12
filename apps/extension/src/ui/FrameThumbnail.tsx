export type FrameThumbnailProps = Readonly<{
  src?: string;
  label: string;
  caption?: string;
  expanded: boolean;
  controlsId: string;
  onToggle: () => void;
}>;

/** A controlled screenshot endpoint; selection belongs to its gallery. */
export function FrameThumbnail({ src, label, caption, expanded, controlsId, onToggle }: FrameThumbnailProps) {
  return (
    <div className="frame-thumbnail">
      {caption && <span className="frame-thumbnail__caption">{caption}</span>}
      {src ? (
        <button
          type="button"
          className="frame-thumbnail__button"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label.toLowerCase()} frame`}
          aria-expanded={expanded}
          aria-controls={controlsId}
          onClick={onToggle}
        >
          <img src={src} alt="" loading="lazy" />
        </button>
      ) : <span className="frame-thumbnail__unavailable" aria-label={`${label} frame unavailable`}>Unavailable</span>}
    </div>
  );
}
