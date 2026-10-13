import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { FrameThumbnail } from '../FrameThumbnail/FrameThumbnail';
import type { GalleryFrame } from '../FrameGallery/FrameGallery';
import styles from './FramePair.module.css';

export type FramePairProps = Readonly<{
  before: GalleryFrame;
  after: GalleryFrame;
  children: ReactNode;
  className?: string;
  expandedClassName?: string;
}>;

/** A fixed before/transition/after layout with one expanded endpoint at a time. */
export function FramePair({ before, after, children, className, expandedClassName }: FramePairProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const previewId = `frame-pair-${useId().replaceAll(':', '')}`;
  const selected = before.id === selectedId ? before : after.id === selectedId ? after : undefined;

  const thumbnail = (frame: GalleryFrame) => (
    <FrameThumbnail
      src={frame.src}
      label={frame.label}
      expanded={selectedId === frame.id}
      controlsId={previewId}
      onToggle={() => setSelectedId((current) => current === frame.id ? null : frame.id)}
    />
  );

  return (
    <>
      <div className={clsx(styles['frame-pair'], className)}>
        <span className={styles['frame-pair__before-label']}>{before.caption ?? before.label}</span>
        <span className={styles['frame-pair__after-label']}>{after.caption ?? after.label}</span>
        <div className={styles['frame-pair__before-frame']}>{thumbnail(before)}</div>
        <div className={styles['frame-pair__transition']}>{children}</div>
        <div className={styles['frame-pair__after-frame']}>{thumbnail(after)}</div>
      </div>
      {selected?.src && (
        <img
          id={previewId}
          className={clsx(styles['frame-pair__expanded'], expandedClassName)}
          src={selected.src}
          alt={`${selected.label} frame`}
        />
      )}
    </>
  );
}
