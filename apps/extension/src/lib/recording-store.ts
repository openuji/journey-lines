import type { Clip, MilestoneCapture } from '@openuji/core';
import type { EndedBy, TabSummary } from './protocol';

export type RecordingItem =
  | Readonly<{ kind: 'capture'; epochMs: number; capture: MilestoneCapture }>
  | Readonly<{ kind: 'clip'; epochMs: number; clip: Clip }>;

export type RecordingMeta = Readonly<{
  id: string;
  tab: TabSummary;
  startedAtMs: number;
  endedAtMs: number;
  endedBy: EndedBy;
  droppedFrames: number;
}>;

export type StoredRecording = Readonly<{ meta: RecordingMeta; items: readonly RecordingItem[] }>;

/** Domain-facing boundary: another adapter can persist or send the same output elsewhere. */
export interface RecordingStore {
  begin(tab: TabSummary, startedAtMs: number): Promise<string>;
  appendCapture(id: string, capture: MilestoneCapture): void;
  appendClip(id: string, clip: Clip, epochMs: number): void;
  finish(id: string, endedAtMs: number, endedBy: EndedBy, droppedFrames: number): Promise<void>;
  discard(id: string): Promise<void>;
  get(id: string): Promise<StoredRecording | null>;
}

type WorkingRecording = {
  tab: TabSummary;
  startedAtMs: number;
  meta: RecordingMeta | null;
  items: RecordingItem[];
};

/** Completed sessions live until this extension service worker loses its memory. */
export class MemoryRecordingStore implements RecordingStore {
  private readonly sessions = new Map<string, WorkingRecording>();

  async begin(tab: TabSummary, startedAtMs: number): Promise<string> {
    const id = `ses_${crypto.randomUUID()}`;
    this.sessions.set(id, { tab, startedAtMs, meta: null, items: [] });
    return id;
  }

  appendCapture(id: string, capture: MilestoneCapture): void {
    this.working(id).items.push({ kind: 'capture', epochMs: capture.frame.receivedAtMs, capture });
  }

  appendClip(id: string, clip: Clip, epochMs: number): void {
    this.working(id).items.push({ kind: 'clip', epochMs, clip });
  }

  async finish(id: string, endedAtMs: number, endedBy: EndedBy, droppedFrames: number): Promise<void> {
    const session = this.working(id);
    session.meta = { id, tab: session.tab, startedAtMs: session.startedAtMs, endedAtMs, endedBy, droppedFrames };
  }

  async discard(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async get(id: string): Promise<StoredRecording | null> {
    const session = this.sessions.get(id);
    return session?.meta ? { meta: session.meta, items: session.items } : null;
  }

  private working(id: string): WorkingRecording {
    const session = this.sessions.get(id);
    if (!session || session.meta) throw new Error(`Recording session ${id} is not active`);
    return session;
  }
}
