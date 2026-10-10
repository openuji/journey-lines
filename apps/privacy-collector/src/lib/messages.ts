import type { CollectedSlot, CollectorState } from './catalog';

export type CollectorRequest =
  | { readonly type: 'collector:get' }
  | { readonly type: 'collector:start'; readonly tabId: number; readonly tenant: string }
  | { readonly type: 'collector:save'; readonly tenant: string; readonly slot: CollectedSlot }
  | { readonly type: 'collector:delete'; readonly id: string }
  | { readonly type: 'collector:clear' }
  | { readonly type: 'collector:export'; readonly download?: boolean };

export type CollectorReply =
  | { readonly ok: true; readonly state?: CollectorState; readonly json?: string }
  | { readonly ok: false; readonly error: string };

export async function request(message: CollectorRequest): Promise<CollectorReply> {
  return chrome.runtime.sendMessage(message) as Promise<CollectorReply>;
}
