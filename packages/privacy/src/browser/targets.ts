import { computeAccessibleDescription, computeAccessibleName, getRole, isInaccessible } from 'dom-accessibility-api';
import type { PrivacyAccessibleTarget, PrivacyCompiledScope, PrivacyTextRule } from '../contract.js';

export function matchesScope(scope: PrivacyCompiledScope, url: URL): boolean {
  const origin = scope.anyPort ? `${url.protocol}//${url.hostname}` : url.origin;
  if (origin !== scope.origin) return false;
  const { kind, value } = scope.path;
  return kind === 'exact' ? url.pathname === value : url.pathname === value ||
    url.pathname.startsWith(value.endsWith('/') ? value : `${value}/`);
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
export function textDestination(element: Element, rule: PrivacyTextRule): Element | Text | null {
  if (element.closest('input, textarea, select, option, script, style, template, noscript, [contenteditable]')) return null;
  if (rule.text?.kind === 'direct-text') {
    const node = element.childNodes[rule.text.childNodeIndex];
    return node?.nodeType === Node.TEXT_NODE ? node as Text : null;
  }
  return element.childElementCount === 0 ? element : null;
}
