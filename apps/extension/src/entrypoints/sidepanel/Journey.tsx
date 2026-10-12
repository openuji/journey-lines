import { useLayoutEffect, useRef } from 'react';
import type { JourneyEvent } from '../../lib/journey-events';
import { EventRow } from './JourneyRow';

/** How close to the bottom still counts as "following" the live journey. */
const FOLLOW_SLACK_PX = 80;

export function Journey({
  events,
  follow = false,
}: {
  events: readonly JourneyEvent[];
  /** Keep the newest row in sight while the person hasn't scrolled away. */
  follow?: boolean;
}) {
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
      element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX;
  };

  if (events.length === 0) {
    return <p className="journey-empty">Waiting for the first frame…</p>;
  }

  return (
    <ol className="journey" ref={list} onScroll={onScroll}>
      {events.map((event) => <EventRow key={event.key} event={event} />)}
    </ol>
  );
}
