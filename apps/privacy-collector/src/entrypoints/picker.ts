import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { defaultScope, defaultTenant, normalizeIdentifier, type CollectedSlot, type CollectorAction,
  type DisplayAttribute, type ScopeMode, type TextTarget } from '../lib/catalog';
import { request } from '../lib/messages';

type Picker = { activate(): void; destroy(): void };
declare global { interface Window { __openujiPrivacyCollector?: Picker } }

const editableTypes = new Set(['text', 'email', 'password', 'search', 'tel', 'url']);
const attr = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
const stable = (value: string): boolean => value.length > 0 && value.length <= 64 && !value.includes('@') &&
  !/^[a-f\d]{12,}$/i.test(value) && !/^\d{8,}$/.test(value);

function unique(selector: string): boolean {
  try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
}

function selectorFor(element: Element): string {
  if (element.getRootNode() !== document) throw new Error('Shadow DOM targets are not supported yet.');
  const tag = element.localName;
  const id = element.getAttribute('id');
  if (id && stable(id)) {
    const selector = `#${CSS.escape(id)}`;
    if (unique(selector)) return selector;
  }
  const name = element.getAttribute('name');
  if (name && stable(name)) {
    const selector = `${tag}[name="${attr(name)}"]`;
    if (unique(selector)) return selector;
  }
  for (const attribute of ['data-testid', 'data-test', 'data-qa']) {
    const value = element.getAttribute(attribute);
    if (value && stable(value)) {
      const selector = `${tag}[${attribute}="${attr(value)}"]`;
      if (unique(selector)) return selector;
    }
  }
  const classes = [...element.classList].filter(stable).slice(0, 3);
  if (classes.length) {
    const selector = `${tag}${classes.map((name) => `.${CSS.escape(name)}`).join('')}`;
    if (unique(selector)) return selector;
  }

  const parts: string[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    let part = current.localName;
    const currentId = current.getAttribute('id');
    if (currentId && stable(currentId)) {
      part += `#${CSS.escape(currentId)}`;
      parts.unshift(part);
      const selector = parts.join(' > ');
      if (unique(selector)) return selector;
      continue;
    }
    const currentClasses = [...current.classList].filter(stable).slice(0, 2);
    if (currentClasses.length) part += currentClasses.map((name) => `.${CSS.escape(name)}`).join('');
    const parent = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((candidate) => candidate.localName === current!.localName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(' > ');
    if (unique(selector)) return selector;
  }
  throw new Error('A unique CSS selector could not be generated.');
}

function inferredSlotId(element: Element): string {
  for (const value of [element.getAttribute('id'), element.getAttribute('name'),
    ...[...element.classList].filter(stable).reverse(), element.localName]) {
    if (value) return normalizeIdentifier(value, 'slot');
  }
  return 'slot';
}

function isMaskable(element: Element): boolean {
  return element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement && editableTypes.has(element.type);
}

function textTargets(element: Element): { label: string; value: string; target: TextTarget }[] {
  if (element.childElementCount === 0) return [{ label: 'Leaf element', value: 'leaf', target: { kind: 'leaf' } }];
  const result: { label: string; value: string; target: TextTarget }[] = [];
  element.childNodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      result.push({ label: `Direct text node ${index}`, value: String(index),
        target: { kind: 'direct-text', childNodeIndex: index } });
    }
  });
  return result;
}

function installPicker(): Picker {
  const host = document.createElement('div');
  host.dataset.openujiPrivacyCollector = '';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
    * { box-sizing: border-box; }
    #highlight { position: fixed; border: 3px solid #78d600; background: rgba(120,214,0,.12); pointer-events:none; }
    #badge { position: fixed; left: 16px; bottom: 16px; padding: 10px 13px; border-radius: 6px; background:#101828; color:#fff;
      font: 600 13px/1.35 system-ui,sans-serif; box-shadow:0 8px 25px #0005; }
    #editor { position: fixed; right: 16px; top: 16px; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
      overflow:auto; pointer-events:auto; padding:18px; border-radius:10px; background:#fff; color:#101828;
      font: 14px/1.4 system-ui,sans-serif; box-shadow:0 15px 50px #0006; }
    h2 { margin:0 0 14px; font-size:18px; } label { display:block; margin:10px 0 4px; font-weight:650; }
    input,textarea,select,button { width:100%; font:inherit; } input,textarea,select { padding:8px; border:1px solid #98a2b3; border-radius:5px; }
    textarea { min-height:64px; resize:vertical; font:12px/1.4 ui-monospace,monospace; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; } .check { display:flex; gap:8px; align-items:center; font-weight:500; }
    .check input { width:auto; } .actions { display:flex; gap:8px; margin-top:16px; } button { padding:9px; border:0; border-radius:5px; cursor:pointer; }
    button[type=submit] { background:#006c4c; color:#fff; } button[type=button] { background:#eaecf0; color:#101828; }
    button:disabled { opacity:.45; cursor:not-allowed; } #validation { margin:10px 0 0; color:#b42318; min-height:20px; }
    #matches { color:#475467; font-size:12px; } [hidden] { display:none !important; }
  </style>
  <div id="highlight" hidden></div><div id="badge">Privacy collector: click an element · Esc cancels</div>
  <form id="editor" hidden>
    <h2>Collect privacy slot</h2>
    <div class="row"><div><label for="tenant">Tenant</label><input id="tenant" required></div>
      <div><label for="slot">Slot ID</label><input id="slot" required></div></div>
    <label for="selector">CSS selector</label><textarea id="selector" required spellcheck="false"></textarea>
    <div id="matches"></div>
    <div class="row"><div><label for="action">Operation</label><select id="action">
      <option value="replace-text">Replace text</option><option value="mask-input">Mask input</option>
      <option value="replace-attribute">Replace display attribute</option></select></div>
      <div id="attribute-wrap"><label for="attribute">Attribute</label><select id="attribute">
        <option>aria-label</option><option>title</option><option>alt</option><option>placeholder</option></select></div></div>
    <div id="replacement-wrap"><label for="replacement">Replacement</label><input id="replacement"></div>
    <div id="text-wrap"><label for="text-target">Text destination</label><select id="text-target"></select></div>
    <div class="row"><div><label for="scope">Page scope</label><select id="scope">
      <option value="exact">This exact path</option><option value="prefix">This path and descendants</option>
      <option value="origin">Whole origin</option></select></div>
      <div><label for="path">Path</label><input id="path" required spellcheck="false"></div></div>
    <label class="check"><input id="multiple" type="checkbox">Allow every matching element</label>
    <p id="validation" role="alert"></p>
    <div class="actions"><button type="button" id="cancel">Cancel</button><button type="submit" id="save">Save slot</button></div>
  </form>`;
  document.documentElement.append(host);

  const element = <T extends HTMLElement>(id: string): T => shadow.getElementById(id) as T;
  const highlight = element<HTMLDivElement>('highlight');
  const badge = element<HTMLDivElement>('badge');
  const editor = element<HTMLFormElement>('editor');
  const tenantInput = element<HTMLInputElement>('tenant');
  const slotInput = element<HTMLInputElement>('slot');
  const selectorInput = element<HTMLTextAreaElement>('selector');
  const matches = element<HTMLDivElement>('matches');
  const actionInput = element<HTMLSelectElement>('action');
  const attributeWrap = element<HTMLDivElement>('attribute-wrap');
  const attributeInput = element<HTMLSelectElement>('attribute');
  const replacementWrap = element<HTMLDivElement>('replacement-wrap');
  const replacementInput = element<HTMLInputElement>('replacement');
  const textWrap = element<HTMLDivElement>('text-wrap');
  const textInput = element<HTMLSelectElement>('text-target');
  const scopeInput = element<HTMLSelectElement>('scope');
  const pathInput = element<HTMLInputElement>('path');
  const multipleInput = element<HTMLInputElement>('multiple');
  const validation = element<HTMLParagraphElement>('validation');
  const save = element<HTMLButtonElement>('save');
  let selected: Element | null = null;
  let selecting = false;
  let availableTextTargets: ReturnType<typeof textTargets> = [];

  const pickedElement = (): Element | null => {
    try { return document.querySelector(selectorInput.value); } catch { return null; }
  };
  const update = (): void => {
    let found: Element[] = [];
    try { found = [...document.querySelectorAll(selectorInput.value)]; } catch { /* validation below */ }
    matches.textContent = `${found.length} match${found.length === 1 ? '' : 'es'} on this page`;
    const target = found[0] ?? selected;
    const action = actionInput.value as CollectorAction;
    attributeWrap.hidden = action !== 'replace-attribute';
    replacementWrap.hidden = action === 'mask-input';
    textWrap.hidden = action !== 'replace-text';
    if (target && action === 'replace-text') {
      availableTextTargets = textTargets(target);
      textInput.replaceChildren(...availableTextTargets.map(({ label, value }) => {
        const option = document.createElement('option'); option.value = value; option.textContent = label; return option;
      }));
    }
    scopeInput.value === 'origin' ? pathInput.value = '/' : undefined;
    pathInput.disabled = scopeInput.value === 'origin';
    let problem = '';
    if (!selectorInput.value || found.length === 0) problem = 'Selector must match at least one element.';
    else if (found.length > 1 && !multipleInput.checked) problem = 'Enable multiple matches or make the selector unique.';
    else if (action === 'mask-input' && !found.every(isMaskable)) problem = 'Mask input supports text-like inputs and textareas.';
    else if (action !== 'mask-input' && replacementInput.value === '') problem = 'Enter the replacement to record.';
    else if (action === 'replace-text' && availableTextTargets.length === 0) problem = 'Choose a leaf element or one with a direct text node.';
    else if (normalizeIdentifier(tenantInput.value, '') !== tenantInput.value) problem = 'Tenant is not a valid identifier.';
    else if (normalizeIdentifier(slotInput.value, '') !== slotInput.value) problem = 'Slot ID is not a valid identifier.';
    else if (!pathInput.value.startsWith('/')) problem = 'Scope path must start with /.';
    validation.textContent = problem;
    save.disabled = problem !== '';
  };

  const stopSelecting = (): void => {
    selecting = false;
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('click', onClick, true);
    highlight.hidden = true;
  };
  const onMove = (event: PointerEvent): void => {
    if (!selecting) return;
    const target = event.composedPath().find((item): item is Element => item instanceof Element && item !== host);
    if (!target || target.getRootNode() !== document) return;
    const rect = target.getBoundingClientRect();
    Object.assign(highlight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    highlight.hidden = false;
  };
  const onClick = (event: MouseEvent): void => {
    if (!selecting) return;
    const target = event.composedPath().find((item): item is Element => item instanceof Element && item !== host);
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    try {
      const selector = selectorFor(target);
      selected = target;
      stopSelecting();
      tenantInput.value = defaultTenant(location.hostname);
      slotInput.value = inferredSlotId(target);
      selectorInput.value = selector;
      actionInput.value = isMaskable(target) ? 'mask-input' : 'replace-text';
      replacementInput.value = '';
      const scope = defaultScope(location.pathname);
      scopeInput.value = scope.mode; pathInput.value = scope.path;
      multipleInput.checked = document.querySelectorAll(selector).length > 1;
      editor.hidden = false; badge.hidden = true; update();
      void request({ type: 'collector:get' }).then((reply) => {
        if (reply.ok && reply.state && reply.state.tenant !== 'tenant') tenantInput.value = reply.state.tenant;
        update();
      });
    } catch (error) {
      badge.textContent = error instanceof Error ? error.message : 'This element cannot be collected.';
    }
  };

  const activate = (): void => {
    stopSelecting();
    selected = null; editor.hidden = true; badge.hidden = false;
    badge.textContent = 'Privacy collector: click an element · Esc cancels';
    selecting = true;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('click', onClick, true);
  };
  const destroy = (): void => { stopSelecting(); document.removeEventListener('keydown', onKey, true); host.remove(); delete window.__openujiPrivacyCollector; };
  const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') destroy(); };

  for (const control of [tenantInput, slotInput, selectorInput, actionInput, attributeInput,
    replacementInput, textInput, scopeInput, pathInput, multipleInput]) control.addEventListener('input', update);
  element<HTMLButtonElement>('cancel').addEventListener('click', destroy);
  editor.addEventListener('submit', (event) => {
    event.preventDefault();
    const target = pickedElement();
    const text = availableTextTargets.find((item) => item.value === textInput.value)?.target;
    const action = actionInput.value as CollectorAction;
    if (!target) return update();
    const slot: CollectedSlot = {
      id: slotInput.value,
      selector: selectorInput.value,
      action,
      ...(action === 'replace-text' ? { replacement: replacementInput.value, text } : {}),
      ...(action === 'replace-attribute' ? {
        replacement: replacementInput.value, attribute: attributeInput.value as DisplayAttribute,
      } : {}),
      ...(multipleInput.checked ? { allowMultiple: true } : {}),
      matchCount: document.querySelectorAll(selectorInput.value).length,
      tagName: target.localName,
      scope: { origin: location.origin, mode: scopeInput.value as ScopeMode, path: pathInput.value },
    };
    save.disabled = true;
    void request({ type: 'collector:save', tenant: tenantInput.value, slot }).then((reply) => {
      if (!reply.ok) { validation.textContent = reply.error; save.disabled = false; return; }
      editor.hidden = true; badge.hidden = false; badge.textContent = `Saved ${slot.id}. Open the extension to collect another slot.`;
      setTimeout(destroy, 1_800);
    });
  });
  document.addEventListener('keydown', onKey, true);
  return { activate, destroy };
}

export default defineUnlistedScript(() => {
  const existing = window.__openujiPrivacyCollector;
  if (existing) existing.activate();
  else {
    const picker = installPicker();
    window.__openujiPrivacyCollector = picker;
    picker.activate();
  }
});
