import { WEBM_DEFAULTS } from '@journey-lines/clip-webm';

/** A saved or startup scale; older settings use the shared encoder default. */
export function parseVideoScale(value: unknown = WEBM_DEFAULTS.scale): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 1) {
    throw new Error('Video scale must be a number between 0.1 and 1.');
  }
  return value;
}
