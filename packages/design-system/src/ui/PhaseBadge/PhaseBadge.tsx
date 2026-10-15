import styles from './PhaseBadge.module.css';

export type PhaseBadgeProps = Readonly<{
  number: number;
  /** What a phase is called, such as "Phase": read out before the number, not shown. */
  name: string;
}>;

/** A phase's number, the same circle wherever the phase is named: in a map of phases, at its head, in the viewer. */
export function PhaseBadge({ number, name }: PhaseBadgeProps) {
  return (
    <span className={styles['phase-badge']}>
      <span className={styles['phase-badge__name']}>{name} </span>
      {number}
    </span>
  );
}
