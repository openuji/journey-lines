import clsx from 'clsx';
import styles from './TagList.module.css';

export type TagListProps = Readonly<{
  tags: readonly string[];
  className?: string;
}>;

/** What a journey is about, as the reader sees it; nothing when there are none. */
export function TagList({ tags, className }: TagListProps) {
  if (tags.length === 0) return null;
  return (
    <ul className={clsx(styles['tag-list'], className)} aria-label="Tags">
      {tags.map((tag) => <li key={tag} className={styles['tag-list__tag']}>{tag}</li>)}
    </ul>
  );
}
