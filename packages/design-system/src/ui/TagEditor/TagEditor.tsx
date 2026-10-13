import { useState, type KeyboardEvent } from 'react';
import type { FieldText } from '@openuji/journey';
import styles from './TagEditor.module.css';

export type TagEditorProps = Readonly<{
  tags: readonly string[];
  /** Tags worth offering again, such as the ones the host's settings name. */
  suggestions?: readonly string[];
  wording: FieldText;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}>;

/** The tags of a report while it is written: remove one, type a new one, or take a suggestion. */
export function TagEditor({ tags, suggestions = [], wording, onAdd, onRemove }: TagEditorProps) {
  const [text, setText] = useState('');
  const offered = suggestions.filter((tag) => !tags.includes(tag));

  const commit = () => {
    if (text.trim() !== '') onAdd(text);
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && text === '' && tags.length > 0) {
      onRemove(tags[tags.length - 1]!);
    }
  };

  return (
    <div className={styles['tag-editor']}>
      <ul className={styles['tag-editor__tags']} aria-label={wording.label}>
        {tags.map((tag) => (
          <li key={tag} className={styles['tag-editor__tag']}>
            {tag}
            <button type="button" className={styles['tag-editor__remove']} aria-label={`Remove tag ${tag}`} onClick={() => onRemove(tag)}>
              ×
            </button>
          </li>
        ))}
        <li className={styles['tag-editor__entry']}>
          <input
            className={styles['tag-editor__input']}
            aria-label={`${wording.label}: new tag`}
            placeholder={wording.placeholder}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
          />
        </li>
      </ul>
      {offered.length > 0 && (
        <ul className={styles['tag-editor__suggestions']} aria-label={`${wording.label}: suggestions`}>
          {offered.map((tag) => (
            <li key={tag}>
              <button type="button" className={styles['tag-editor__suggestion']} onClick={() => onAdd(tag)}>+ {tag}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
