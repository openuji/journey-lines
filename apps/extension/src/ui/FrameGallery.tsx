import { useId, useState } from 'react';
import { FrameThumbnail } from './FrameThumbnail';

export type GalleryFrame = Readonly<{
  id: string;
  label: string;
  src?: string;
  caption?: string;
}>;

export type FrameGalleryProps = Readonly<{
  frames: readonly GalleryFrame[];
  className?: string;
  expandedClassName?: string;
}>;

/** A gallery owns exactly one selected screenshot, independent of its host. */
export function FrameGallery({ frames, className, expandedClassName }: FrameGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previewId = `frame-gallery-${useId().replaceAll(':', '')}`;
  const selected = frames.find((frame) => frame.id === selectedId);

  return (
    <>
      <div className={['frame-gallery__items', className].filter(Boolean).join(' ')}>
        {frames.map(({ id, ...frame }) => (
          <FrameThumbnail
            key={id}
            {...frame}
            expanded={selectedId === id}
            controlsId={previewId}
            onToggle={() => setSelectedId((current) => current === id ? null : id)}
          />
        ))}
      </div>
      {selected?.src && (
        <img
          id={previewId}
          className={['frame-gallery__expanded', expandedClassName].filter(Boolean).join(' ')}
          src={selected.src}
          alt={`${selected.label} frame`}
        />
      )}
    </>
  );
}
