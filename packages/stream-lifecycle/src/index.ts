import type {
  CdpEventParams,
  CdpResult,
  CdpTransport,
  Detach,
} from '@openuji/cdp';
import {
  createPushStream,
  type LifecycleEvent,
  type PushStreamStats,
} from '@openuji/core';

type Frame = CdpEventParams<'Page.frameNavigated'>['frame'];
type FrameTree = CdpResult<'Page.getFrameTree'>['frameTree'];

export interface LifecycleStreamHandle {
  events: AsyncIterable<LifecycleEvent>;
  stop: () => Promise<void>;
  readonly stats: PushStreamStats;
}

/**
 * Attaches the lifecycle source: navigations — to a new document or within
 * the same one — and lifecycle milestones, emitted synchronously from inside
 * the CDP event handlers.
 *
 * Only milestones that happen while we watch are reported — never the ones the
 * page had already reached when we attached.
 */
export async function attachLifecycle(
  cdp: CdpTransport,
  emit: (event: LifecycleEvent) => void,
): Promise<Detach> {
  let mainFrameId: string | null = null;
  // Which document each frame shows. A same-document navigation does not say,
  // and it keeps the document, so it is looked up here.
  const loaders = new Map<string, string>();

  const offCommits = cdp.on('Page.frameNavigated', ({ frame }, { receivedAtMs }) => {
    if (!frame.parentId) mainFrameId = frame.id;
    loaders.set(frame.id, frame.loaderId);
    emit(navigated(frame, receivedAtMs));
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

  const offAll = (): void => {
    offCommits();
    offWithinDocument();
    offDetached();
  };

  try {
    await cdp.send('Page.enable');

    // The document already showing, so the engine has one straight away. A
    // fresh tab's `about:blank` is nobody's destination: its frame is the main
    // frame, but it is not reported.
    const tree = await cdp.send('Page.getFrameTree').catch(() => null);
    const root = tree?.frameTree?.frame;
    if (tree?.frameTree) rememberLoaders(tree.frameTree, loaders);
    if (root) mainFrameId = root.id;
    if (root && root.url !== 'about:blank') emit(navigated(root, cdp.clock.now()));

    // Chromium answers this only after reporting every milestone the current
    // document has already reached. Listening for milestones from here on keeps
    // that report of the past out: rules arm on "the next frame after X", so X
    // must be something we actually witnessed.
    await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
  } catch (err) {
    offAll();
    throw err;
  }

  const offMilestones = cdp.on('Page.lifecycleEvent', (raw, { receivedAtMs }) =>
    emit({
      type: 'milestone',
      frameId: raw.frameId,
      isMainFrame: raw.frameId === mainFrameId,
      loaderId: raw.loaderId,
      name: raw.name,
      receivedAtMs,
      monotonicTime: raw.timestamp,
    }),
  );

  return async () => {
    await cdp
      .send('Page.setLifecycleEventsEnabled', { enabled: false })
      .catch(() => {});
    offAll();
    offMilestones();
  };
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

/** Records the document of every frame in an attach-time frame tree. */
function rememberLoaders(tree: FrameTree, loaders: Map<string, string>): void {
  loaders.set(tree.frame.id, tree.frame.loaderId);
  for (const child of tree.childFrames ?? []) rememberLoaders(child, loaders);
}

/**
 * Streams navigation lifecycle events from CDP, on its own — no orchestrator,
 * no sibling streams. Leaves the transport to its owner.
 *
 * Events here are the arming signals the document rules latch on, so this
 * stream is never allowed to drop.
 */
export async function createLifecycleStream(
  cdp: CdpTransport,
): Promise<LifecycleStreamHandle> {
  const stream = createPushStream<LifecycleEvent>();

  const detach = await attachLifecycle(cdp, (event) => stream.push(event));

  const stop = async (): Promise<void> => {
    if (stream.closed) return;

    await detach();
    stream.end();
  };

  return { events: stream.iterable, stop, stats: stream.stats };
}
