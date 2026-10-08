import { useEffect, useState } from 'react';
import { Button } from '../../ui/Button';
import type { RecordOptions } from '../../lib/protocol';

/** Before a recording: one button, for the tab in front of the person, and how to record it. */
export function Idle({
  failed,
  onRecord,
}: {
  /** The last attempt failed; the button is usable again. */
  failed: boolean;
  onRecord: (tabId: number, options: RecordOptions) => void;
}) {
  // Off by default: each scroll is its before and after screenshots.
  const [video, setVideo] = useState(false);
  // Between the click and the worker's answer, a second click would only
  // collide with the first.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (failed) setPending(false);
  }, [failed]);

  const record = async (): Promise<void> => {
    setPending(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) {
      setPending(false);
      return;
    }
    onRecord(tab.id, { video });
  };

  return (
    <section className="idle">
      <Button
        className="record-button"
        variant="primary"
        disabled={pending}
        onClick={() => void record()}
      >
        <span className="record-icon" aria-hidden />
        Record
      </Button>
      <p className="hint">Records the active tab, and follows you to other tabs</p>
      <label className="option">
        <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
        Video of each scroll
      </label>
    </section>
  );
}
