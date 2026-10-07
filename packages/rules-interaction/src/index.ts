import type { MilestoneRule } from '@openuji/engine';
import { ClickEpisodeRule } from './click.js';
import { ScrollEpisodeRule } from './scroll.js';

export * from './episode.js';
export * from './rest.js';
export * from './scroll.js';
export * from './click.js';

/**
 * User-interaction rules, in label order.
 *
 * Unlike the document rules these repeat within a view, numbering each episode
 * from 01 in every view. Click captures carry the DOM metadata of what was
 * clicked; a post-scroll capture carries the path the page took.
 */
export const defaultInteractionRules: readonly MilestoneRule[] = [
  ScrollEpisodeRule,
  ClickEpisodeRule,
];
