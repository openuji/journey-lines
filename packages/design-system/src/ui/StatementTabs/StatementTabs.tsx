import clsx from 'clsx';
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './StatementTabs.module.css';

/** Something written about a journey: its label, its text, and whether it is a problem. */
export type StatementTab = Readonly<{ label: string; text: string; tone?: 'plain' | 'problem' }>;

export type StatementTabsProps = Readonly<{
  items: readonly StatementTab[];
  className?: string;
}>;

/**
 * Statements told by their labels alone, side by side. Pointing at a label,
 * or focusing it, makes it a tab joined to a panel of its text, over what
 * lies below, so nothing moves; moving along to the next label shows its text
 * instead. The panels hang from the start of the labels and are at most as
 * wide as the nearest container: the host leaves them that room.
 */
export function StatementTabs({ items, className }: StatementTabsProps) {
  const id = useId();
  return (
    <div className={clsx(styles['statement-tabs'], className)}>
      {items.map((item, index) => (
        <div
          key={item.label}
          className={clsx(styles['statement-tabs__item'], item.tone === 'problem' && styles['statement-tabs__item--problem'])}
        >
          <button type="button" className={styles['statement-tabs__tab']} aria-describedby={`${id}${index}`}>
            {item.label}
            <ChevronDown className={styles['statement-tabs__icon']} aria-hidden />
          </button>
          <p id={`${id}${index}`} role="tooltip" className={styles['statement-tabs__panel']}>{item.text}</p>
        </div>
      ))}
    </div>
  );
}
