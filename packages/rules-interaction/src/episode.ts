/**
 * Label prefixes of the interaction rules; the numeric prefix orders output
 * filenames. Build full labels with {@link episodeLabel}.
 */
export const InteractionLabel = {
  preScroll: '03-pre-scroll',
  postScroll: '04-post-scroll',
  preClick: '10-pre-click',
  postClick: '11-post-click',
} as const;

/** Two-digit episode suffix shared by all numbered interaction labels. */
export function episodeLabel(prefix: string, episode: number): string {
  return `${prefix}-${String(episode).padStart(2, '0')}`;
}
