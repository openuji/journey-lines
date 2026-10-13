import { defineBackground } from 'wxt/utils/define-background';
import {
  buildProfileDocument,
  EMPTY_STATE,
  normalizeIdentifier,
  parseState,
  STORAGE_KEY,
  validateSlot,
  type CollectorState,
} from '../lib/catalog';
import type { CollectorReply, CollectorRequest } from '../lib/messages';

async function loadState(): Promise<CollectorState> {
  return parseState((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]);
}

async function saveState(state: CollectorState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function tenant(value: unknown): string {
  if (typeof value !== 'string' || normalizeIdentifier(value, '') !== value) {
    throw new Error('Tenant must start with a letter and use lowercase letters, numbers, dots, dashes, or underscores.');
  }
  return value;
}

function assertPageScope(slot: ReturnType<typeof validateSlot>, sender: chrome.runtime.MessageSender): void {
  const sourceValue = sender.url ?? sender.tab?.url;
  if (!sourceValue) throw new Error('The selected page could not be identified.');
  const source = new URL(sourceValue);
  if (source.origin !== slot.scope.origin) throw new Error('The collected scope does not match the selected page.');
  if (slot.scope.mode === 'exact' && source.pathname !== slot.scope.path) {
    throw new Error('The exact scope does not match the selected page path.');
  }
  if (slot.scope.mode === 'prefix' && source.pathname !== slot.scope.path &&
      !source.pathname.startsWith(slot.scope.path.endsWith('/') ? slot.scope.path : `${slot.scope.path}/`)) {
    throw new Error('The prefix scope does not contain the selected page path.');
  }
}

async function handle(message: CollectorRequest, sender: chrome.runtime.MessageSender): Promise<CollectorReply> {
  switch (message.type) {
    case 'collector:get': return { ok: true, state: await loadState() };
    case 'collector:start': {
      const selectedTenant = tenant(message.tenant);
      if (!Number.isSafeInteger(message.tabId)) throw new Error('No active web page is available.');
      const state = await loadState();
      await saveState({ ...state, tenant: selectedTenant });
      try {
        await chrome.scripting.executeScript({ target: { tabId: message.tabId }, files: ['picker.js'] });
      } catch {
        throw new Error('This page does not allow selector collection. Open an http or https page and try again.');
      }
      return { ok: true };
    }
    case 'collector:save': {
      const selectedTenant = tenant(message.tenant);
      const slot = validateSlot(message.slot);
      assertPageScope(slot, sender);
      const state = await loadState();
      if (state.slots.some((candidate) => candidate.id === slot.id)) {
        throw new Error('A slot with this ID already exists. Choose another slot ID.');
      }
      const slots = [...state.slots, slot];
      const next = { tenant: selectedTenant, slots };
      await saveState(next);
      return { ok: true, state: next };
    }
    case 'collector:delete': {
      const state = await loadState();
      const next = { ...state, slots: state.slots.filter((slot) => slot.id !== message.id) };
      await saveState(next);
      return { ok: true, state: next };
    }
    case 'collector:clear': {
      const state = await loadState();
      const next = { tenant: state.tenant, slots: [] };
      await saveState(next);
      return { ok: true, state: next };
    }
    case 'collector:export': {
      const state = await loadState();
      const json = `${JSON.stringify(buildProfileDocument(state), null, 2)}\n`;
      if (message.download) {
        await chrome.downloads.download({
          url: `data:application/ld+json;charset=utf-8,${encodeURIComponent(json)}`,
          filename: `${state.tenant}/profiles.jsonld`,
          saveAs: false,
        });
      }
      return { ok: true, json };
    }
  }
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.storage.local.get(STORAGE_KEY).then((stored) => {
      if (stored[STORAGE_KEY] === undefined) return saveState(EMPTY_STATE);
    });
  });
  chrome.runtime.onMessage.addListener((value: unknown, sender, sendResponse) => {
    const message = value as CollectorRequest;
    void handle(message, sender).then(sendResponse, (error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Privacy collector failed.',
    } satisfies CollectorReply));
    return true;
  });
});
