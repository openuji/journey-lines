import { computeAccessibleDescription, computeAccessibleName, getRole, isInaccessible } from 'dom-accessibility-api';
import type { PrivacyAccessibleTarget, PrivacyRule } from '../contract.js';

const EDITABLE = 'input, textarea, select, option, [contenteditable]';
/** Accname can consult embedded controls; never let it extract their values. */
function includesEditable(element: Element, seen = new Set<Element>()): boolean {
  if (seen.has(element)) return false;
  seen.add(element);
  if (element.closest(EDITABLE) || element.querySelector(EDITABLE)) return true;
  for (const attribute of ['aria-labelledby', 'aria-describedby']) {
    for (const id of (element.getAttribute(attribute) ?? '').split(/\s+/)) {
      const referenced = document.getElementById(id);
      if (referenced && includesEditable(referenced, seen)) return true;
    }
  }
  return false;
}

export function resolveAccessible(target: PrivacyAccessibleTarget): Element[] {
  // The cache exists only during resolution and stores booleans, never computed names.
  const cache = new Map<PrivacyAccessibleTarget, Map<Element, boolean>>();
  const matches = (element: Element, locator: PrivacyAccessibleTarget): boolean => {
    let results = cache.get(locator);
    if (!results) { results = new Map(); cache.set(locator, results); }
    const previous = results.get(element);
    if (previous !== undefined) return previous;
    const result = !isInaccessible(element) &&
      (locator.role === undefined || getRole(element) === locator.role) &&
      ((locator.name === undefined && locator.description === undefined) || !includesEditable(element)) &&
      (locator.name === undefined || computeAccessibleName(element) === locator.name) &&
      (locator.description === undefined || computeAccessibleDescription(element) === locator.description) &&
      locator.contexts.every((context) => {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (matches(ancestor, context)) return true;
        }
        return false;
      });
    results.set(element, result);
    return result;
  };
  return [...document.querySelectorAll('*')].filter((element) => matches(element, target));
}

/** Resolve write destinations without reading any existing text or editable value. */
export function textDestination(element: Element, rule: PrivacyRule): Element | Text | null {
  if (rule.action === 'mask-input') {
    return element instanceof HTMLInputElement && ['text', 'email', 'password', 'search', 'tel', 'url'].includes(element.type) ||
      element instanceof HTMLTextAreaElement ? element : null;
  }
  if (rule.action === 'replace-attribute') return element;
  if (element.closest('input, textarea, select, option, script, style, template, noscript, [contenteditable]')) return null;
  if (rule.text?.kind === 'direct-text') {
    const node = element.childNodes[rule.text.childNodeIndex];
    return node?.nodeType === Node.TEXT_NODE ? node as Text : null;
  }
  return element.childElementCount === 0 ? element : null;
}
