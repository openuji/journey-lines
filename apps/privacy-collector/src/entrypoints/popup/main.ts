import { defaultTenant, normalizeIdentifier, type CollectorState } from '../../lib/catalog';
import { request } from '../../lib/messages';
import './styles.css';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const tenant = element<HTMLInputElement>('tenant');
const pick = element<HTMLButtonElement>('pick');
const slots = element<HTMLDivElement>('slots');
const empty = element<HTMLParagraphElement>('empty');
const count = element<HTMLSpanElement>('count');
const copy = element<HTMLButtonElement>('copy');
const download = element<HTMLButtonElement>('download');
const clear = element<HTMLButtonElement>('clear');
const status = element<HTMLParagraphElement>('status');
let state: CollectorState = { tenant: 'tenant', slots: [] };

async function activePage(): Promise<chrome.tabs.Tab | undefined> {
  const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focused) return focused;
  const active = await chrome.tabs.query({ active: true });
  return active.sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];
}

function message(text: string, error = false): void {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function render(next: CollectorState): void {
  state = next;
  tenant.value = state.tenant;
  slots.replaceChildren(...state.slots.map((slot) => {
    const item = document.createElement('div'); item.className = 'slot';
    const head = document.createElement('div'); head.className = 'slot-head';
    const name = document.createElement('strong'); name.textContent = slot.id;
    const operation = document.createElement('span'); operation.textContent = slot.action;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    remove.ariaLabel = `Remove ${slot.id}`;
    remove.addEventListener('click', () => void request({ type: 'collector:delete', id: slot.id }).then((reply) => {
      if (reply.ok && reply.state) render(reply.state); else message(reply.ok ? 'Slot was not removed.' : reply.error, true);
    }));
    const selector = document.createElement('code'); selector.textContent = slot.selector;
    head.append(name, operation, remove); item.append(head, selector); return item;
  }));
  count.textContent = String(state.slots.length);
  empty.hidden = state.slots.length > 0;
  copy.disabled = download.disabled = clear.disabled = state.slots.length === 0;
}

async function exportProfile(downloadFile: boolean): Promise<void> {
  const reply = await request({ type: 'collector:export', download: downloadFile });
  if (!reply.ok) return message(reply.error, true);
  if (!reply.json) return message('The exported profile was empty.', true);
  if (!downloadFile) await navigator.clipboard.writeText(reply.json);
  message(downloadFile ? `${state.tenant}/profiles.jsonld downloaded.` : 'JSON-LD copied.');
}

pick.addEventListener('click', () => {
  void (async () => {
    const chosen = normalizeIdentifier(tenant.value, '');
    if (!chosen || chosen !== tenant.value) return message('Enter a valid lowercase tenant identifier.', true);
    const tab = await activePage();
    if (tab?.id === undefined) return message('No active page is available.', true);
    const reply = await request({ type: 'collector:start', tabId: tab.id, tenant: chosen });
    if (!reply.ok) return message(reply.error, true);
    window.close();
  })().catch((error: unknown) => message(error instanceof Error ? error.message : 'Picker could not start.', true));
});
copy.addEventListener('click', () => void exportProfile(false).catch(() => message('JSON-LD could not be copied.', true)));
download.addEventListener('click', () => void exportProfile(true).catch(() => message('Profile could not be downloaded.', true)));
clear.addEventListener('click', () => {
  if (!confirm('Clear every collected slot?')) return;
  void request({ type: 'collector:clear' }).then((reply) => {
    if (reply.ok && reply.state) { render(reply.state); message('Catalog cleared.'); }
    else message(reply.ok ? 'Catalog was not cleared.' : reply.error, true);
  });
});

void Promise.all([request({ type: 'collector:get' }), activePage()])
  .then(([reply, active]) => {
    if (!reply.ok || !reply.state) return message(reply.ok ? 'Catalog could not be loaded.' : reply.error, true);
    if (reply.state.tenant === 'tenant' && active?.url) {
      try { render({ ...reply.state, tenant: defaultTenant(new URL(active.url).hostname) }); }
      catch { render(reply.state); }
    } else render(reply.state);
  })
  .catch(() => message('Catalog could not be loaded.', true));
