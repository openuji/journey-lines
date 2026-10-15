import { useTranslation } from '../../localisation/TranslationProvider';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { readSizeToken } from '../../lib/read-size-token';
import { previewPlacement, type PreviewAnchor } from './floating-preview';
import styles from './FloatingPreview.module.css';

export type FloatingPreviewProps = Readonly<{
  id: string;
  anchor: PreviewAnchor;
  onDismiss: () => void;
  children: ReactNode;
  caption?: string;
}>;

/** Portaled so a scrolling timeline cannot clip the preview. */
export function FloatingPreview({ id, anchor, onDismiss, children, caption }: FloatingPreviewProps) {
  const { language, dir } = useTranslation();
  useEffect(() => {
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onDismiss]);
  const placement = previewPlacement(
    anchor,
    { width: window.innerWidth, height: window.innerHeight },
    {
      width: readSizeToken(document.documentElement, '--ds-preview-width'),
      height: readSizeToken(document.documentElement, '--ds-preview-height'),
      margin: readSizeToken(document.documentElement, '--ds-preview-margin'),
    },
  );
  return createPortal(
    <div id={id} className={styles['floating-preview']} role="tooltip" style={placement} dir={dir} lang={language}>
      {children}
      {caption && <span className={styles['floating-preview__caption']}>{caption}</span>}
    </div>,
    document.body,
  );
}
