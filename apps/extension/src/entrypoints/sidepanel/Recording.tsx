import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import type { MilestoneCapture } from '@openuji/core';
import { formatClock, shortUrl } from '../../lib/journey';
import type { RecorderStatus } from '../../lib/protocol';
import { Button } from '../../ui/Button';
import { StatusBadge } from '../../ui/StatusBadge';
import { Journey } from './Journey';

type Live = Extract<RecorderStatus, { state: 'recording' | 'stopping' }>;

export function Recording({
  status,
  captures,
  onStop,
}: {
  status: Live;
  captures: readonly MilestoneCapture[];
  onStop: () => void;
}) {
  const stopping = status.state === 'stopping';

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

      <div className="tab-chip" title={status.tab.url}>
        <span className="tab-chip__dot" aria-hidden />
        {status.tab.title || shortUrl(status.tab.url)}
      </div>

      <Journey captures={captures} startedAtMs={status.startedAtMs} follow />
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
