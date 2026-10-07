import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { formatClock, shortUrl } from '../../lib/journey';
import type { RecorderStatus } from '../../lib/protocol';
import { Journey } from './Journey';

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
  const now = useNow(500);
  const stopping = status.state === 'stopping';

  return (
    <>
      <header className="recording-header">
        <span className={stopping ? 'rec-badge' : 'rec-badge rec-badge--live'}>
          <span className="rec-badge__dot" aria-hidden />
          {stopping ? 'Finishing…' : 'REC'}
        </span>
        <span className="clock">{formatClock(now - status.startedAtMs)}</span>
        <button className="stop-button" disabled={stopping} onClick={onStop}>
          <Square size={12} fill="currentColor" />
          Stop
        </button>
      </header>

      <div className="tab-chip" title={status.tab.url}>
        <span className="tab-chip__dot" aria-hidden />
        {status.tab.title || shortUrl(status.tab.url)}
      </div>

      <Journey captures={captures} clips={clips} startedAtMs={status.startedAtMs} follow />
    </>
  );
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
