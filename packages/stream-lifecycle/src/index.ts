import type {
  CdpEventParams,
  CdpResult,
  CdpTransport,
  Detach,
} from '@openuji/cdp';
import {
  createPushStream,
  type DocumentEvent,
  type LifecycleEvent,
  type PushStreamStats,
} from '@openuji/core';

type Frame = CdpEventParams<'Page.frameNavigated'>['frame'];
type FrameTree = CdpResult<'Page.getFrameTree'>['frameTree'];

/** A document the main frame committed. */
export type CommittedDocument = Readonly<{
  frameId: string;
  loaderId: string;
  url: string;
  mimeType: string;
}>;

/**
 * One kind of document — HTML, PDF, … — and what a recording observes in it
 * beyond its commit. A kind reports in the stack's own terms (`milestone`,
 * the probe's events); its own signals never leave it.
 */
export interface DocumentKind {
  /** Whether this kind observes `document`. */
  describes(document: CommittedDocument): boolean;
  /** Observe this kind's documents on one session, reporting through `emit`. */
  attach(cdp: CdpTransport, emit: (event: DocumentEvent) => void): Promise<DocumentObserver>;
}

export interface DocumentObserver {
  /** The main frame committed: `document` when it is this kind's, else null. */
  shown(document: CommittedDocument | null): void;
  detach: Detach;
}

export interface LifecycleStreamHandle {
  events: AsyncIterable<DocumentEvent>;
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * Attaches the lifecycle source: navigations — to a new document or within
 * the same one — emitted synchronously from inside the CDP event handlers,
 * and for each document the main frame shows, the first of `kinds` that
 * describes it. That kind observes it; its events pass only while one of its
 * documents shows. A document no kind describes is seen in pictures only.
 */
export async function attachLifecycle(
  cdp: CdpTransport,
  emit: (event: DocumentEvent) => void,
  kinds: readonly DocumentKind[],
): Promise<Detach> {
  let mainFrameId: string | null = null;
  // Which document each frame shows. A same-document navigation does not say,
  // and it keeps the document, so it is looked up here.
  const loaders = new Map<string, string>();
  let current: CommittedDocument | null = null;
  let showing: DocumentKind | undefined;
  const observers = new Map<DocumentKind, DocumentObserver>();

  const show = (frame: Frame): void => {
    const document = committed(frame);
    current = document;
    showing = kinds.find((kind) => kind.describes(document));
    for (const [kind, observer] of observers) observer.shown(kind === showing ? document : null);
  };

  const offCommits = cdp.on('Page.frameNavigated', ({ frame }, { receivedAtMs }) => {
    loaders.set(frame.id, frame.loaderId);
    emit(navigated(frame, receivedAtMs));
    if (frame.parentId) return;
    mainFrameId = frame.id;
    show(frame);
  });

  const offWithinDocument = cdp.on(
    'Page.navigatedWithinDocument',
    ({ frameId, url, navigationType }, { receivedAtMs }) =>
      emit({
        type: 'navigated',
        frameId,
        isMainFrame: frameId === mainFrameId,
        loaderId: loaders.get(frameId) ?? '',
        url,
        sameDocument: true,
        navigationType,
        receivedAtMs,
      }),
  );

  const offDetached = cdp.on('Page.frameDetached', ({ frameId }) => {
    loaders.delete(frameId);
  });

  const detach = async (): Promise<void> => {
    offCommits();
    offWithinDocument();
    offDetached();
    const attached = [...observers.values()];
    observers.clear();
    await Promise.all(attached.map((observer) => observer.detach().catch(() => {})));
  };

  try {
    await cdp.send('Page.enable');

    // The document already showing, so the engine has one straight away. A
    // fresh tab's `about:blank` is nobody's destination: its frame is the main
    // frame, but it is not reported.
    const tree = await cdp.send('Page.getFrameTree').catch(() => null);
    const root = tree?.frameTree?.frame;
    if (tree?.frameTree) rememberLoaders(tree.frameTree, loaders);
    if (root) {
      mainFrameId = root.id;
      if (root.url !== 'about:blank') emit(navigated(root, cdp.clock.now()));
      show(root);
    }

    // Each kind hears which document shows as soon as it is attached, so it
    // never misses one committed meanwhile.
    for (const kind of kinds) {
      const observer = await kind.attach(cdp, (event) => {
        if (showing === kind) emit(event);
      });
      observers.set(kind, observer);
      observer.shown(showing === kind ? current : null);
    }
  } catch (err) {
    await detach();
    throw err;
  }

  return detach;
}

/** A frame showing a new document, as a lifecycle event. Pure. */
function navigated(frame: Frame, receivedAtMs: number): LifecycleEvent {
  return {
    type: 'navigated',
    frameId: frame.id,
    isMainFrame: !frame.parentId,
    loaderId: frame.loaderId,
    url: frame.url,
    sameDocument: false,
    receivedAtMs,
  };
}

/** The document a main frame committed, as the kinds see it. Pure. */
function committed(frame: Frame): CommittedDocument {
  return {
    frameId: frame.id,
    loaderId: frame.loaderId,
    url: frame.url,
    mimeType: frame.mimeType,
  };
}

/** Records the document of every frame in an attach-time frame tree. */
function rememberLoaders(tree: FrameTree, loaders: Map<string, string>): void {
  loaders.set(tree.frame.id, tree.frame.loaderId);
  for (const child of tree.childFrames ?? []) rememberLoaders(child, loaders);
}

/**
 * Streams the lifecycle and what `kinds` observe, on its own — no
 * orchestrator, no sibling streams. Leaves the transport to its owner.
 *
 * Events here are the arming signals the document rules latch on, so this
 * stream is never allowed to drop.
 */
export async function createLifecycleStream(
  cdp: CdpTransport,
  kinds: readonly DocumentKind[],
): Promise<LifecycleStreamHandle> {
  const stream = createPushStream<DocumentEvent>();

  const detach = await attachLifecycle(cdp, (event) => stream.push(event), kinds);

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    await detach();
    stream.end();
  };

  return { events: stream.iterable, stop, stats: stream.stats };
}
