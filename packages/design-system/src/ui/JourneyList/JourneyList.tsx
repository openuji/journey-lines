import { Route } from 'lucide-react';
import { formatClock, formatDate, shortUrl, type JourneyEntry } from '@openuji/journey';
import { TagList } from '../TagList/TagList';
import styles from './JourneyList.module.css';

export type JourneyListProps = Readonly<{
  /** In the order they are listed. */
  journeys: readonly JourneyEntry[];
  /** Where a journey's report opens. */
  href: (id: string) => string;
}>;

/** The journeys there are, each opening its report. Holds no state. */
export function JourneyList({ journeys, href }: JourneyListProps) {
  return (
    <>
      <header className={styles['journeys-bar']}>
        <Route aria-hidden />
        <h1 className={styles['journeys-bar__title']}>Journeys</h1>
        {/* <span className={styles['journeys-bar__meta']}>{journeys.length}</span> */}
      </header>
      <main className={styles['journeys']}>
        {journeys.length === 0
          ? <p className={styles['journeys__message']}>No journeys yet.</p>
          : (
            <ol className={styles['journeys__list']}>
              {journeys.map((journey) => <JourneyItem key={journey.id} journey={journey} href={href(journey.id)} />)}
            </ol>
          )}
      </main>
    </>
  );
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** The whole row opens the report; its link text is the title alone. */
function JourneyItem({ journey, href }: { journey: JourneyEntry; href: string }) {
  return (
    <li>

      <div  className={styles['journey']}>
      <TagList tags={journey.tags} />
      <div className={styles['journey__teaser']}>

      <h2 className={styles['journey__title']}>
        <a href={href}>{journey.title}</a>
      </h2>
      <p className={styles['journey__meta']}>
        <time dateTime={new Date(journey.startedAtMs).toISOString()}>{formatDate(journey.startedAtMs)}</time>
        <span>{formatClock(journey.endedAtMs - journey.startedAtMs)}</span>
        <span>{count(journey.steps.length, 'step')}</span>
        {journey.phases.length > 0 && <span>{count(journey.phases.length, 'phase')}</span>}
      </p>
      <p className={styles['journey__page']} title={journey.page.url}>{shortUrl(journey.page.url)}</p>
      </div>
      </div>
    </li>
  );
}
