import clsx from 'clsx';
import styles from './EditableText.module.css';

export type EditableTextProps = Readonly<{
  value: string;
  /** Names the field for assistive technology while editing. */
  label: string;
  placeholder?: string;
  editing: boolean;
  onChange?: (value: string) => void;
  /** The element that holds the text when it is read. */
  as?: 'p' | 'h1' | 'span';
  className?: string;
}>;

/** One text in two states: a growing field while editing, plain text when read, nothing when empty. */
export function EditableText({ value, label, placeholder, editing, onChange, as: Tag = 'p', className }: EditableTextProps) {
  if (editing) {
    return (
      <textarea
        className={clsx(styles['editable-text'], className)}
        aria-label={label}
        placeholder={placeholder}
        rows={1}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  }
  if (value.trim() === '') return null;
  return <Tag className={clsx(styles['editable-text--read'], className)}>{value}</Tag>;
}
