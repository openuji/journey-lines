import { useTranslation } from '../../localisation/TranslationProvider';
import { useId, useState } from 'react';
import clsx from 'clsx';
import { FrameThumbnail } from '../FrameThumbnail/FrameThumbnail';
import styles from './FrameGallery.module.css';

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
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previewId = `frame-gallery-${useId().replaceAll(':', '')}`;
  const selected = frames.find((frame) => frame.id === selectedId);

  return (
    <>
      <div className={clsx(styles['frame-gallery__items'], className)}>
        {frames.map((frame) => (
          <FrameThumbnail
            key={frame.id}
            src={frame.src}
            label={frame.label}
            expanded={selectedId === frame.id}
            controlsId={previewId}
            onToggle={() => setSelectedId((current) => current === frame.id ? null : frame.id)}
          />
        ))}
      </div>
      {selected?.src && (
        <img
          id={previewId}
          className={clsx(styles['frame-gallery__expanded'], expandedClassName)}
          src={selected.src}
          alt={t('media.frameAlt', { label: selected.label })}
        />
      )}
    </>
  );
}
