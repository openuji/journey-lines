import type { Clip, MilestoneCapture } from '@openuji/core';
import { formatClock, shortUrl } from '../../lib/journey';
import type { EndedBy, RecorderStatus } from '../../lib/protocol';
import { Button } from '../../ui/Button';
import { Journey } from './Journey';

type Finished = Extract<RecorderStatus, { state: 'done' }>;

const endedNote: Record<EndedBy, string | null> = {
  user: null,
  'window-closed': 'The recording ended because its window was closed.',
  'debugging-cancelled': 'The recording ended because debugging was cancelled in Chrome.',
};

export function Done({
  status,
  captures,
  clips,
  onReset,
  onOpenReport,
}: {
  status: Finished;
  captures: readonly MilestoneCapture[];
  clips: readonly Clip[];
  onReset: () => void;
  onOpenReport: (sessionId: string) => void;
}) {
  const views = new Set(captures.map((capture) => capture.viewId)).size;
  const note = endedNote[status.endedBy];

  return (
    <>
      <header className="done-header">
        <Button className="secondary-button" size="small" onClick={onReset}>
          Done
        </Button>
        <span className="done-header__title" title={status.tab.url}>
          {status.tab.title || shortUrl(status.tab.url)}
        </span>
        {status.sessionId && (
          <Button className="open-report-button" size="small" onClick={() => onOpenReport(status.sessionId!)}>Open report</Button>
        )}
      </header>

      <dl className="summary">
        <div>
          <dt>Duration</dt>
          <dd>{formatClock(status.endedAtMs - status.startedAtMs)}</dd>
        </div>
        <div>
          <dt>Views</dt>
          <dd>{views}</dd>
        </div>
        <div>
          <dt>Captures</dt>
          <dd>{captures.length}</dd>
        </div>
        {status.droppedFrames > 0 && (
          <div>
            <dt>Dropped frames</dt>
            <dd>{status.droppedFrames}</dd>
          </div>
        )}
      </dl>

      {note && <p className="note">{note}</p>}

      <Journey captures={captures} clips={clips} startedAtMs={status.startedAtMs} />
    </>
  );
}
