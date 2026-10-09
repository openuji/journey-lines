import type { MilestoneRule } from '@openuji/engine';
import { ClickEpisodeRule } from './click.js';
import { ScrollEpisodeRule } from './scroll.js';

export * from './episode.js';
export * from './scroll.js';
export * from './click.js';

/**
 * User-interaction rules, in label order.
 *
 * Unlike the document rules these repeat within a view, numbering each episode
 * from 01 in every view. The 10/11 captures describe the target at its press;
 * a post-scroll capture carries the path the page reported.
 */
export const defaultInteractionRules: readonly MilestoneRule[] = [
  ScrollEpisodeRule,
  ClickEpisodeRule,
];
