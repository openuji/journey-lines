import type { MilestoneRule } from '@openuji/engine';
import { ClickEpisodeRule } from './click.js';

export * from './episode.js';
export * from './click.js';

/**
 * User-interaction rules.
 *
 * Unlike the document rules these repeat within a view, numbering each episode
 * from 01 in every view, and every capture carries the DOM metadata of what the
 * user touched.
 */
export const defaultInteractionRules: readonly MilestoneRule[] = [ClickEpisodeRule];
