import { useEffect, useState } from 'react';

/** Before a recording: one button, for the tab in front of the person. */
export function Idle({
  failed,
  onRecord,
}: {
  /** The last attempt failed; the button is usable again. */
  failed: boolean;
  onRecord: (tabId: number) => void;
}) {
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
    onRecord(tab.id);
  };

  return (
    <section className="idle">
      <button className="record-button" disabled={pending} onClick={() => void record()}>
        <span className="record-dot" aria-hidden />
        Record
      </button>
      <p className="hint">Records the active tab</p>
    </section>
  );
}
