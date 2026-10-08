import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import type { Clip, MilestoneCapture } from '@openuji/core';
import type { ActiveTabState } from '@openuji/fused';
import { formatClock, shortUrl } from '../../lib/journey';
import type { RecorderStatus } from '../../lib/protocol';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/StatusBadge';
import { Journey } from './Journey';

/** What to say about the active tab when it is not being recorded. */
const activeNote: Record<ActiveTabState, string | null> = {
  recording: null,
  attaching: 'Waiting for the page…',
  refused: "Paused: Chrome doesn't let extensions record this page.",
};

type Live = Extract<RecorderStatus, { state: 'recording' | 'stopping' }>;

export function Recording({
  status,
  captures,
  clips,
  onStop,
}: {
  status: Live;
  captures: readonly MilestoneCapture[];
  clips: readonly Clip[];
  onStop: () => void;
}) {
  const stopping = status.state === 'stopping';
  const note = activeNote[status.active.state];

  return (
    <>
      <header className="recording-header">
        <StatusBadge tone={stopping ? 'neutral' : 'live'}>
          {stopping ? 'Finishing…' : 'REC'}
        </StatusBadge>
        <ElapsedClock startedAtMs={status.startedAtMs} />
        <Button className="stop-button" size="small" disabled={stopping} onClick={onStop}>
          <Square size={12} fill="currentColor" />
          Stop
        </Button>
      </header>

      <div className="tab-chip" title={status.active.tab.url}>
        <span className="tab-chip__dot" aria-hidden />
        {status.active.tab.title || shortUrl(status.active.tab.url)}
      </div>
      {note && <p className="note">{note}</p>}

      <Journey captures={captures} clips={clips} startedAtMs={status.startedAtMs} follow />
    </>
  );
}

/** Kept separate so its half-second tick does not rerender the journey. */
function ElapsedClock({ startedAtMs }: { startedAtMs: number }) {
  const now = useNow(500);
  return <span className="clock">{formatClock(now - startedAtMs)}</span>;
}

/** The current time, refreshed every `intervalMs`. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
