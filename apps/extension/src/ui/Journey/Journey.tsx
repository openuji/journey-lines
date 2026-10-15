import { useLayoutEffect, useRef } from 'react';
import type { JourneyEvent } from '@openuji/journey';
import { EventRow, readSizeToken, useTranslation } from '@openuji/design-system';
import styles from './Journey.module.css';

export function Journey({
  events,
  follow = false,
}: {
  events: readonly JourneyEvent[];
  /** Keep the newest row in sight while the person hasn't scrolled away. */
  follow?: boolean;
}) {
  const { t } = useTranslation();
  const list = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  useLayoutEffect(() => {
    const element = list.current;
    if (follow && element && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [follow, events]);

  const onScroll = (): void => {
    const element = list.current;
    if (!element) return;
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < readSizeToken(element, '--ds-journey-follow-slack');
  };

  if (events.length === 0) {
    return <p className={styles['journey-empty']} role="status">{t('panel.waitingForFrame')}</p>;
  }

  return (
    <ol className={styles['journey']} ref={list} onScroll={onScroll}>
      {events.map((event) => <EventRow key={event.key} event={event} />)}
    </ol>
  );
}
