import type { CdpTransport, Detach } from '@openuji/cdp';
import type { CommittedDocument, DocumentKind } from '@openuji/stream-lifecycle';
import { attachProbe } from '@openuji/stream-probe';

/**
 * The PDF's frame has settled once its own network has been idle (Chromium's
 * `networkIdle` there): the viewer has loaded the document and drawn it.
 * Measured on Chrome 154: about a second after the load, when the screen had
 * already stopped changing. The viewer's own word that it has loaded the file
 * (`loadProgress` 100) comes before the drawing: the next frame shows its
 * progress bar.
 */
const SETTLED = 'networkIdle';

const autoAttach = (cdp: CdpTransport, autoAttach: boolean) =>
  // Never held at start: the person's PDF must not wait on us.
  cdp.send('Target.setAutoAttach', { autoAttach, waitForDebuggerOnStart: false, flatten: true });

/**
 * PDFs, as Chrome shows them: in its viewer, a frame of another extension,
 * that holds the PDF's own frame. The tab's page is an empty shell around them.
 *
 * What it observes, from the PDF's frame: that the document has settled, and
 * what the person does, from the probe in it. Chrome attaches those frames
 * through the tab's session: the tab's child is the viewer, the viewer's child
 * the PDF.
 */
export const pdfDocuments: DocumentKind = {
  describes: (document) => document.mimeType === 'application/pdf',

  async attach(cdp, emit) {
    let document: CommittedDocument | null = null;
    /** What to undo in each child session taken, and the session it belongs to. */
    const children = new Map<string, Readonly<{ parent: CdpTransport; release: Detach }>>();

    /** Take the child session `sessionId` of `parent`, observed by `observe` until it goes. */
    const adopt = (
      parent: CdpTransport,
      sessionId: string,
      observe: (child: CdpTransport) => Promise<Detach>,
    ): void => {
      const child = parent.child(sessionId);
      const observed = observe(child).catch(() => async () => {});
      children.set(sessionId, {
        parent,
        release: async () => {
          await (await observed)();
          child.dispose();
        },
      });
    };

    const release = async (sessionId: string): Promise<void> => {
      const child = children.get(sessionId);
      children.delete(sessionId);
      await child?.release();
    };

    /** A session whose children it adopts with `observe`. */
    const adoptChildren = (
      parent: CdpTransport,
      observe: (child: CdpTransport) => Promise<Detach>,
    ): Detach => {
      const offAttached = parent.on('Target.attachedToTarget', ({ sessionId }) =>
        adopt(parent, sessionId, observe),
      );
      const offDetached = parent.on('Target.detachedFromTarget', ({ sessionId }) => {
        void release(sessionId);
      });
      return async () => {
        offAttached();
        offDetached();
      };
    };

    /** The PDF's frame: the probe, and when the document has settled. */
    const pdfFrame = async (frame: CdpTransport): Promise<Detach> => {
      const detachProbe = await attachProbe(frame, emit);
      // Answered only after reporting what the frame had already reached;
      // listening from here on keeps that out.
      await frame.send('Page.setLifecycleEventsEnabled', { enabled: true });
      const offSettled = frame.on('Page.lifecycleEvent', ({ name }, { receivedAtMs }) => {
        if (name !== SETTLED || !document) return;
        emit({ type: 'milestone', name: 'settled', loaderId: document.loaderId, receivedAtMs });
      });

      return async () => {
        offSettled();
        await frame.send('Page.setLifecycleEventsEnabled', { enabled: false }).catch(() => {});
        await detachProbe();
      };
    };

    /** The viewer: its child is the PDF's frame. */
    const viewer = async (frame: CdpTransport): Promise<Detach> => {
      const stopAdopting = adoptChildren(frame, pdfFrame);
      await autoAttach(frame, true);
      return stopAdopting;
    };

    const stopAdopting = adoptChildren(cdp, viewer);

    return {
      shown: (shown) => {
        const wasShowing = document !== null;
        document = shown;
        // Only while a PDF shows: on a page, auto-attach would take its iframes too.
        if (wasShowing !== (shown !== null)) void autoAttach(cdp, shown !== null).catch(() => {});
      },
      detach: async () => {
        await stopAdopting();
        // The PDF's frame before the viewer it belongs to: ending the viewer's
        // session would end the frame's before its probe is out.
        const taken = [...children].reverse();
        children.clear();
        for (const [sessionId, { parent, release }] of taken) {
          await release();
          await parent.send('Target.detachFromTarget', { sessionId }).catch(() => {});
        }
        if (document) await autoAttach(cdp, false).catch(() => {});
      },
    };
  },
};
