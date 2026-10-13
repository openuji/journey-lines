import type { TextTarget } from './catalog';

const NON_TEXT_TARGET = 'input, textarea, select, option, script, style, template, noscript, [contenteditable]';

export function textTargets(element: Element): { label: string; value: string; target: TextTarget }[] {
  if (element.closest(NON_TEXT_TARGET)) return [];
  if (element.childElementCount === 0) return [{ label: 'Element text', value: 'leaf', target: { kind: 'leaf' } }];
  const result: { label: string; value: string; target: TextTarget }[] = [];
  element.childNodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      result.push({ label: `Text part ${result.length + 1}`, value: String(index),
        target: { kind: 'direct-text', childNodeIndex: index } });
    }
  });
  return result;
}

/** Layout only: no text is copied into the picker, its messages, or exported rules. */
export function targetRects(target: Element | Text): DOMRect[] {
  if (target instanceof Element) return [target.getBoundingClientRect()];
  const range = document.createRange();
  range.selectNodeContents(target);
  return [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
}

export function textAtPoint(element: Element, x: number, y: number): Text | null {
  if (element.closest(NON_TEXT_TARGET)) return null;
  const node = document.caretPositionFromPoint
    ? document.caretPositionFromPoint(x, y)?.offsetNode
    : document.caretRangeFromPoint(x, y)?.startContainer;
  if (!(node instanceof Text) || node.parentElement !== element || !node.textContent?.trim()) return null;
  // Caret lookup can return nearby text when the pointer is in empty space.
  return targetRects(node).some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    ? node : null;
}
