import type { CdpTransport } from '@journey-lines/cdp';
import { PRIVACY_BINDING, PRIVACY_DISPOSE, PRIVACY_INSTALL } from './constants.js';
import type { PrivacyDiagnostic, PrivacyInitialResult, PrivacyProgram, PrivacyRendered } from './contract.js';
import { decodeDiagnostic, decodeSnapshot, decodeRendered } from './decode.js';
import { PRIVACY_SOURCE } from './generated/privacy-source.js';

export type { PrivacyProgram, PrivacyRule, PrivacyTextRule, PrivacyDiagnostic, PrivacyInitialResult } from './contract.js';
export { compilePrivacy, PrivacyCompileError } from './compile.js';
export { privacyProfileFromDocument } from './document.js';
export { createPrivacy } from './composition.js';
export type { PrivacyCoverageDiagnostic, PrivacyRecordingDiagnostic } from './recording-host.js';
export type { PrivacyCompileDiagnostic, PrivacyCompileStatus } from './compile.js';
export { PRIVACY_CATALOG_CONTEXT, PRIVACY_CSS_EXTENSION } from './profile.js';
export type { PrivacyProfile, PrivacyPageScope, PrivacyReplacementRule, PrivacyTextTarget,
  PrivacyCatalogNode, AccessibleLocator, CustomLocator, PrivacyMetadataRule, PrivacyDisplayAttribute } from './profile.js';

export interface PrivacyAttachmentOptions {
  readonly allFrames?: boolean;
  readonly onRendered?: (contextId: number, evidence: PrivacyRendered) => void;
  readonly onContextUnavailable?: (contextId: number) => void;
  readonly onContext?: (contextId: number, frameId: string) => void;
}

export interface PrivacyAttachment {
  /** The document showing at attachment: completion or explicit cancellation. */
  readonly ready: Promise<PrivacyInitialResult>;
  /** Unregisters injection and pending work, without restoring content or closing CDP. */
  dispose(): Promise<void>;
}

// One owner for each binding/script registration. Browser-side reinjection is idempotent.
const attached = new WeakSet<CdpTransport>();

export async function attachPrivacy(
  cdp: CdpTransport,
  program: PrivacyProgram,
  onDiagnostic: (diagnostic: PrivacyDiagnostic) => void,
  options: PrivacyAttachmentOptions = {},
): Promise<PrivacyAttachment> {
  if (attached.has(cdp)) throw new Error('Privacy is already attached to this transport');
  // Copy configuration so later caller mutations cannot change the wire decoder.
  const configuration: PrivacyProgram = JSON.parse(JSON.stringify({ id: program.id, profileId: program.profileId, rules: program.rules }));
  const installOptions = { allFrames: options.allFrames === true, readiness: options.onRendered !== undefined };
  const source = `${PRIVACY_SOURCE}\n;globalThis.${PRIVACY_INSTALL}(${JSON.stringify(configuration)},${JSON.stringify(installOptions)})`;
  const contextRequest = JSON.stringify({ type: 'context', programId: configuration.id });
  attached.add(cdp);

  let settle!: (result: PrivacyInitialResult) => void;
  const ready = new Promise<PrivacyInitialResult>((resolve) => { settle = resolve; });
  let initialContext: number | undefined;
  let ownFrame: string | undefined;
  const contexts = new Map<number, string>();
  let scriptId: string | undefined;
  let bindingAdded = false;
  let stopped: Promise<void> | undefined;

  const off = [
    cdp.on('Runtime.executionContextCreated', ({ context }) => {
      const frameId: unknown = context.auxData?.frameId;
      if (context.auxData?.isDefault === true && typeof frameId === 'string') contexts.set(context.id, frameId);
    }),
    cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => {
      contexts.delete(executionContextId);
      if (executionContextId === initialContext) settle({ status: 'cancelled', reason: 'document-replaced' });
    }),
    cdp.on('Runtime.executionContextsCleared', () => {
      contexts.clear();
      if (initialContext !== undefined) settle({ status: 'cancelled', reason: 'document-replaced' });
    }),
    cdp.on('Runtime.bindingCalled', (event) => {
      if (event.name !== PRIVACY_BINDING || ownFrame === undefined) return;
      if (event.payload === contextRequest) {
        initialContext = event.executionContextId;
        contexts.set(initialContext, ownFrame);
        options.onContext?.(initialContext, ownFrame);
        return;
      }
      if (!contexts.has(event.executionContextId) || !options.allFrames && contexts.get(event.executionContextId) !== ownFrame) return;
      const rendered = options.onRendered && decodeRendered(event.payload, configuration.id);
      if (rendered) { options.onRendered!(event.executionContextId, rendered); return; }
      const diagnostic = decodeDiagnostic(event.payload, configuration);
      if (!diagnostic) return;
      if (event.executionContextId === initialContext && diagnostic.type === 'completed') {
        settle({ status: 'completed', matched: diagnostic.matched, overwritten: diagnostic.overwritten });
      }
      onDiagnostic(diagnostic);
    }),
  ];

  const dispose = (): Promise<void> => stopped ??= (async () => {
    for (const unsubscribe of off) unsubscribe();
    settle({ status: 'cancelled', reason: 'disposed' });
    // Unregister first so navigation during cleanup cannot install another runtime.
    if (scriptId) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }).catch(() => {});
    if (bindingAdded) {
      const expression = `globalThis.${PRIVACY_DISPOSE}?.(); delete globalThis.${PRIVACY_INSTALL}; delete globalThis.${PRIVACY_DISPOSE}; delete globalThis.${PRIVACY_BINDING};`;
      if (options.allFrames) {
        await Promise.all([...contexts.keys()].map((contextId) => cdp.send('Runtime.evaluate', { expression, contextId }).catch(() => {})));
      } else await cdp.send('Runtime.evaluate', { expression }).catch(() => {});
      await cdp.send('Runtime.removeBinding', { name: PRIVACY_BINDING }).catch(() => {});
    }
    contexts.clear();
    attached.delete(cdp);
  })();

  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    ownFrame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    await cdp.send('Runtime.addBinding', { name: PRIVACY_BINDING });
    bindingAdded = true;
    scriptId = (await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
    if (!scriptId) throw new Error('Privacy script registration returned no identifier');
    // Runtime may already be enabled by another client (or a previous attachment),
    // so it need not replay context-created events. Ask the current top context
    // to identify itself over our binding, then pin the evaluation to that context.
    const contextReply = await cdp.send('Runtime.evaluate', {
      expression: `globalThis.${PRIVACY_BINDING}(${JSON.stringify(contextRequest)})`,
    });
    if (contextReply.exceptionDetails) throw new Error('Privacy context discovery failed');
    if (initialContext === undefined) throw new Error('No current document context for privacy injection');
    const result = await cdp.send('Runtime.evaluate', {
      expression: source, contextId: initialContext, returnByValue: true,
    });
    // Exception messages can contain page data; expose only a fixed installation error.
    if (result.exceptionDetails) throw new Error('Privacy runtime installation failed');
    const snapshot = decodeSnapshot(result.result.value);
    if (!snapshot) throw new Error('Privacy runtime returned an invalid installation result');
    if (snapshot.status === 'completed') settle({ status: 'completed', matched: snapshot.matched, overwritten: snapshot.overwritten });
    if (options.allFrames) {
      await Promise.all([...contexts.keys()].filter((id) => id !== initialContext).map(async (contextId) => {
        try {
          const reply = await cdp.send('Runtime.evaluate', { expression: source, contextId });
          if (reply.exceptionDetails) options.onContextUnavailable?.(contextId);
        } catch { options.onContextUnavailable?.(contextId); }
      }));
    }
    return { ready, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
