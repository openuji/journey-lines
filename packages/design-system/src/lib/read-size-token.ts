/** Read a CSS size at the point of use so layout and pointer math share one source. */
export function readSizeToken(element: Element, token: `--ds-${string}`): number {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(token));
  if (!Number.isFinite(value)) throw new Error(`Missing size token ${token}`);
  return value;
}
