/** Bundled into the test worker only; no production test hook or profile override. */
import { extensionTabs, attachTab } from '@openuji/host-extension';
import { recordActiveTab } from '@openuji/fused';
import { createPrivacy, type PrivacyProfile, type PrivacyRecordingDiagnostic } from '@openuji/privacy';
import { PROBE_BINDING_NAME } from '@openuji/stream-probe';
import { Recorder } from '../../apps/extension/src/lib/recorder';
import { MemoryRecordingStore } from '../../apps/extension/src/lib/recording-store';
import { openClips } from '../../apps/extension/src/lib/clips';

export const diagnostics: PrivacyRecordingDiagnostic[] = [];
export const probeReports: string[] = [];
export const store = new MemoryRecordingStore();
let recording: Recorder;
let inspection: Awaited<ReturnType<typeof attachTab>> | undefined;
export async function open(url: string) {
  const tab = await chrome.tabs.create({ url, active: true });
  while ((await chrome.tabs.get(tab.id!)).status !== 'complete') await new Promise((resolve) => setTimeout(resolve, 25));
  return tab.id!;
}
export async function start(profile: PrivacyProfile, url: string) {
  const privacy = createPrivacy(profile, { onDiagnostic: (d) => diagnostics.push(d) });
  const describe = async (id: number) => {
    const tab = await chrome.tabs.get(id);
    return privacy.sanitizeLocation({ id, windowId: tab.windowId, url: tab.url ?? '', title: tab.title ?? '' });
  };
  recording = new Recorder((windowId) => extensionTabs(chrome, windowId), describe, () => {}, openClips, store,
    (host, tab, options) => recordActiveTab(privacy.wrapHost(host), tab, {
      ...options, sinks: options.sinks.map((sink) => privacy.wrapCaptureSink(sink)),
      ...(options.clips ? { clips: privacy.wrapClipSink(options.clips) } : {}),
    }));
  await recording.record(await describe(await open(url)), { video: true });
  recording.cdp!.on('Runtime.bindingCalled', (event) => { if (event.name === PROBE_BINDING_NAME) probeReports.push(event.payload); });
}
export function send(method: string, params?: object) {
  return ((recording.cdp ?? inspection!.cdp).send as (method: string, params?: object) => Promise<unknown>)(method, params);
}
export function captures() { return recording.captures; }
export function clips() { return recording.clips; }
export function status() { return recording.status; }
export async function stop() {
  const before = recording.status;
  await recording.stop();
  if (before.state === 'recording') inspection = await attachTab(chrome.debugger, before.active.tab.id);
  const status = recording.status;
  return status.state === 'done' && status.sessionId ? store.get(status.sessionId) : null;
}
