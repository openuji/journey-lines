import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { journeyRows } from '../../lib/journey';
import { CaptureRow, ViewRow } from './JourneyRow';

/** How close to the bottom still counts as "following" the live journey. */
const FOLLOW_SLACK_PX = 80;

export function Journey({
  captures,
  clips,
  startedAtMs,
  follow = false,
}: {
  captures: readonly MilestoneCapture[];
  /** Videos, each shown on the row of the capture it belongs to. */
  clips: readonly Clip[];
  startedAtMs: number;
  /** Keep the newest row in sight while the person hasn't scrolled away. */
  follow?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const rows = useMemo(
    () => journeyRows(captures, startedAtMs, clips),
    [captures, clips, startedAtMs],
  );

  useLayoutEffect(() => {
    const element = list.current;
    if (follow && element && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [follow, captures.length]);

  const onScroll = (): void => {
    const element = list.current;
    if (!element) return;
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX;
  };

  if (captures.length === 0) {
    return <p className="journey-empty">Waiting for the first frame…</p>;
  }

  return (
    <ol className="journey" ref={list} onScroll={onScroll}>
      {rows.map((row) =>
        row.kind === 'view' ? (
          <ViewRow key={row.key} entry={row.entry} url={row.url} />
        ) : (
          <CaptureRow
            key={row.key}
            capture={row.capture}
            captureKind={row.captureKind}
            atMs={row.atMs}
            clip={row.clip}
          />
        ),
      )}
    </ol>
  );
}
