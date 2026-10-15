import type { Cancel, CdpEventListener, CdpTransport, TabHost, TabSession } from '@journey-lines/cdp';
import type { PrivacyDiagnostic, PrivacyProgram, PrivacyRendered } from './contract.js';
import { attachPrivacy, type PrivacyAttachment } from './index.js';

export interface PrivacyCoverageDiagnostic {
  readonly type: 'coverage';
  readonly profileId: string;
  readonly programId: string;
  readonly status: 'complete' | 'missing-coverage' | 'rule-skipped' | 'unsupported-document'
    | 'installation-failed' | 'readiness-timeout' | 'timing-unavailable' | 'uncovered-frame';
  readonly coverage: 'complete' | 'incomplete';
  readonly level: 'info' | 'warning';
}
export type PrivacyRecordingDiagnostic = PrivacyDiagnostic | PrivacyCoverageDiagnostic;
export type PrivacyReporter = (diagnostic: PrivacyRecordingDiagnostic) => void;
const WAIT_MS = 5_000;

type Frame = {
  id: string;
  loaderId?: string;
  contextId?: number;
  evidence?: PrivacyRendered;
  done: boolean;
  afterMs?: number;
  cancel?: Cancel;
};

/** A synchronous CDP decorator: frames wait for proof; all other events retain their order and stamps. */
export function recordingPrivacyTransport(raw: CdpTransport, program: PrivacyProgram, report: PrivacyReporter) {
  const frames = new Map<string, Frame>();
  const contexts = new Map<number, Frame>();
  const listeners = new Set<CdpEventListener<'Page.screencastFrame'>>();
  const children = new Set<ReturnType<typeof recordingPrivacyTransport>>();
  let ownFrame: string | undefined;
  let attachment: PrivacyAttachment | undefined;
  let installed = false;
  let stopped = false;
  let timingWarning = false;
  let announcedComplete = false;
  let settle!: () => void;
  const ready = new Promise<void>((resolve) => { settle = resolve; });
  const warn = (status: PrivacyCoverageDiagnostic['status']) => report({
    type: 'coverage', profileId: program.profileId ?? program.id, programId: program.id, status,
    coverage: status === 'complete' ? 'complete' : 'incomplete', level: status === 'complete' ? 'info' : 'warning',
  });
  const settled = () => {
    if (installed && frames.size && [...frames.values()].every((frame) => frame.done)) {
      if (!announcedComplete && [...frames.values()].every((frame) =>
        frame.afterMs !== undefined && frame.evidence && frame.evidence.applicable > 0 && frame.evidence.failed === 0)) {
        announcedComplete = true;
        warn('complete');
      }
      cancelInitial(); settle();
    }
  };
  const abandon = (status: PrivacyCoverageDiagnostic['status']) => {
    if (stopped) return;
    installed = true;
    for (const frame of frames.values()) {
      if (!frame.done && frame.id !== ownFrame && frame.contextId === undefined) warn('uncovered-frame');
      frame.done = true; frame.cancel?.();
    }
    warn(status);
    cancelInitial();
    settle();
  };
  const cancelInitial = raw.clock.at(raw.clock.now() + WAIT_MS, () => abandon('readiness-timeout'));
  const begin = (id: string, loaderId?: string): Frame => {
    const previous = frames.get(id);
    previous?.cancel?.();
    if (previous?.contextId !== undefined) contexts.delete(previous.contextId);
    const frame: Frame = { id, loaderId, done: false };
    frames.set(id, frame);
    timingWarning = false;
    announcedComplete = false;
    frame.cancel = raw.clock.at(raw.clock.now() + WAIT_MS, () => {
      if (stopped || frames.get(id) !== frame) return;
      frame.done = true;
      warn(frame.contextId === undefined && id !== ownFrame ? 'uncovered-frame' : 'readiness-timeout');
      settled();
    });
    return frame;
  };
  const clear = () => {
    for (const frame of frames.values()) frame.cancel?.();
    frames.clear();
    contexts.clear();
  };

  let readingClock: Frame | undefined;
  let timebase: { frame: Frame; navigationStartMs: number } | undefined;
  const finishRendered = () => {
    if (stopped || !ownFrame) return;
    const top = frames.get(ownFrame);
    if (!top?.evidence) return;
    if (timebase?.frame !== top) {
      if (readingClock === top) return;
      readingClock = top;
      raw.send('Performance.getMetrics').then(({ metrics }) => {
        if (stopped || frames.get(top.id) !== top || !top.evidence) return;
        const seconds = metrics?.find((metric) => metric.name === 'NavigationStart')?.value;
        if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
          for (const frame of frames.values()) if (frame.evidence) { frame.done = true; frame.cancel?.(); }
          warn('timing-unavailable');
          settled();
          return;
        }
        timebase = { frame: top, navigationStartMs: seconds * 1_000 };
        finishRendered();
      }).catch(() => {
        if (!stopped && frames.get(top.id) === top) abandon('timing-unavailable');
      });
      return;
    }
    for (const frame of frames.values()) {
      if (!frame.evidence || frame.afterMs !== undefined) continue;
      // NavigationStart and the top document's timeOrigin name the same instant.
      // Convert each accessible child document's own performance clock into it.
      frame.afterMs = timebase.navigationStartMs + frame.evidence.timeOriginMs - top.evidence.timeOriginMs + frame.evidence.afterMs;
      frame.done = true;
      frame.cancel?.();
      if (frame.evidence.applicable === 0) warn('missing-coverage');
      else if (frame.evidence.failed > 0) warn('rule-skipped');
    }
    settled();
  };

  const off = [
    raw.on('Page.frameNavigated', ({ frame }) => {
      if (!frame.parentId) { clear(); ownFrame = frame.id; timebase = undefined; }
      const state = begin(frame.id, frame.loaderId);
      if (frame.mimeType && !/^(text\/html|application\/xhtml\+xml)$/.test(frame.mimeType)) {
        state.done = true; state.cancel?.(); warn('unsupported-document'); settled();
      }
    }),
    raw.on('Page.frameAttached', ({ frameId }) => { if (!frames.has(frameId)) begin(frameId); }),
    raw.on('Page.frameDetached', ({ frameId, reason }) => {
      const frame = frames.get(frameId);
      if (!frame) return;
      frame.cancel?.();
      if (frame.contextId !== undefined) contexts.delete(frame.contextId);
      if (reason === 'swap') { frame.done = true; frame.afterMs = undefined; warn('uncovered-frame'); }
      else frames.delete(frameId);
      settled();
    }),
    raw.on('Runtime.executionContextCreated', ({ context }) => {
      const frameId = context.auxData?.frameId;
      if (context.auxData?.isDefault !== true || typeof frameId !== 'string') return;
      let frame = frames.get(frameId);
      if (!frame || frame.contextId !== undefined && frame.contextId !== context.id) frame = begin(frameId, frame?.loaderId);
      frame.contextId = context.id;
      contexts.set(context.id, frame);
    }),
    raw.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
      const frame = contexts.get(executionContextId);
      if (frame && frames.get(frame.id) === frame) begin(frame.id, frame.loaderId);
      contexts.delete(executionContextId);
    }),
    raw.on('Runtime.executionContextsCleared', () => { clear(); if (ownFrame) begin(ownFrame); timebase = undefined; }),
    raw.on('Page.screencastFrame', (event, meta) => {
      const pending = !installed || [...frames.values()].some((frame) => !frame.done);
      const seconds = (event.metadata as { monotonicTimestamp?: unknown }).monotonicTimestamp;
      const hasTime = typeof seconds === 'number' && Number.isFinite(seconds);
      const proven = frames.size > 0 && [...frames.values()].every((frame) => frame.afterMs !== undefined);
      const boundary = Math.max(...[...frames.values()].map((frame) => frame.afterMs ?? -Infinity));
      const stale = hasTime && seconds * 1_000 < boundary;
      if (!pending && (!hasTime || !proven) && !timingWarning) { timingWarning = true; warn('timing-unavailable'); }
      if (pending || stale || listeners.size === 0) {
        // A discarded frame must never occupy Chrome's one in-flight slot.
        void raw.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        return;
      }
      for (const listener of [...listeners]) listener(event, meta);
    }),
  ];

  const cdp: CdpTransport = {
    clock: raw.clock,
    send: raw.send.bind(raw),
    on: ((event, listener) => {
      if (event !== 'Page.screencastFrame') return raw.on(event, listener);
      const frameListener = listener as CdpEventListener<'Page.screencastFrame'>;
      listeners.add(frameListener);
      return () => { listeners.delete(frameListener); };
    }) as CdpTransport['on'],
    child(sessionId) {
      const child = raw.child(sessionId);
      const guard = recordingPrivacyTransport(child, program, report);
      children.add(guard);
      return { ...guard.cdp, dispose: () => {
        // Keep the child transport usable until its script and binding cleanup ends.
        void guard.dispose().finally(() => { children.delete(guard); child.dispose(); }).catch(() => {});
      } };
    },
  };

  void (async () => {
    try {
      await raw.send('Page.enable');
      const { frameTree } = await raw.send('Page.getFrameTree');
      if (stopped) return;
      ownFrame = frameTree.frame.id;
      const visit = (tree: typeof frameTree) => {
        if (!frames.has(tree.frame.id)) {
          const frame = begin(tree.frame.id, tree.frame.loaderId);
          if (tree.frame.mimeType && !/^(text\/html|application\/xhtml\+xml)$/.test(tree.frame.mimeType)) {
            frame.done = true; frame.cancel?.(); warn('unsupported-document');
          }
        }
        for (const child of tree.childFrames ?? []) visit(child);
      };
      visit(frameTree);
      await raw.send('Performance.enable');
      if (stopped) return;
      attachment = await attachPrivacy(raw, program, report, {
        allFrames: true,
        onContext(contextId, frameId) {
          const frame = frames.get(frameId) ?? begin(frameId);
          frame.contextId = contextId;
          contexts.set(contextId, frame);
        },
        onRendered(contextId, evidence) {
          const frame = contexts.get(contextId);
          if (!frame || frames.get(frame.id) !== frame || frame.evidence && frame.evidence.documentToken !== evidence.documentToken) return;
          frame.evidence = evidence;
          finishRendered();
        },
        onContextUnavailable(contextId) {
          const frame = contexts.get(contextId);
          if (frame) { frame.done = true; frame.cancel?.(); warn('uncovered-frame'); settled(); }
        },
      });
      if (stopped) { await attachment.dispose(); return; }
      installed = true;
      settled();
    } catch { abandon('installation-failed'); }
  })();

  let disposal: Promise<void> | undefined;
  const dispose = () => disposal ??= (async () => {
    stopped = true;
    cancelInitial();
    clear();
    for (const unsubscribe of off) unsubscribe();
    listeners.clear();
    settle();
    await Promise.all([...children].map((child) => child.dispose()));
    await attachment?.dispose();
  })();
  return { cdp, ready, dispose };
}

export function privacyHost<Tab>(host: TabHost<Tab>, program: PrivacyProgram, report: PrivacyReporter): TabHost<Tab> {
  return {
    onActive: host.onActive.bind(host), onGone: host.onGone.bind(host),
    async attach(tab): Promise<TabSession> {
      const session = await host.attach(tab);
      const guard = recordingPrivacyTransport(session.cdp, program, report);
      let ended = false;
      const off = session.onClosed(() => { ended = true; void guard.dispose(); });
      await guard.ready;
      if (ended) { off(); throw new Error('Privacy session ended during attachment'); }
      let stopped: Promise<void> | undefined;
      return {
        cdp: guard.cdp, onClosed: session.onClosed.bind(session),
        close: () => stopped ??= (async () => { off(); try { await guard.dispose(); } finally { await session.close(); } })(),
      };
    },
  };
}
