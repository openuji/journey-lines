import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CompositorFrame } from '@openuji/core';
import type { JourneyEvent } from '../../src/lib/journey-events';
import { Journey } from '../../src/entrypoints/sidepanel/Journey';
import { storyTransitionClip } from '../../src/stories/media';
import { transitionFrames } from '../../src/stories/transition-fixture';
import { Button } from '../../src/ui/Button';
import '../../src/ui/styles.css';
import '../../src/entrypoints/sidepanel/styles.css';

function frame(index: 0 | 2): CompositorFrame {
  return {
    index, base64: transitionFrames[index].base64, receivedAtMs: transitionFrames[index].atMs,
    viewportWidth: 96, viewportHeight: 54, pageScaleFactor: 1, scrollX: 0, scrollY: 0,
  };
}

function page(viewId: number): JourneyEvent {
  return { kind: 'page', key: `page:${viewId}`, viewId, url: `https://example.test/${viewId}`, atMs: viewId * 1_000, entry: 'load', frame: frame(0) };
}

const initialEvents: readonly JourneyEvent[] = [
  page(1),
  { kind: 'click', key: 'click:1:01', viewId: 1, url: 'https://example.test/1', atMs: 100, before: frame(0), after: frame(2), clip: storyTransitionClip },
  { kind: 'scroll', key: 'scroll:1:01', viewId: 1, url: 'https://example.test/1', atMs: 200, before: frame(0), after: frame(2), clip: storyTransitionClip },
  { kind: 'click', key: 'click:1:02', viewId: 1, url: 'https://example.test/1', atMs: 300, after: frame(2) },
  ...Array.from({ length: 12 }, (_, index) => page(index + 2)),
];

function MediaApp() {
  const [events, setEvents] = useState(initialEvents);
  return (
    <main className="panel">
      <Button id="append" onClick={() => setEvents((current) => [...current, page(current.length)])}>Append page</Button>
      <Journey events={events} follow />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<MediaApp />);
