import type { MilestoneRule } from '@openuji/engine';
import { FirstFrameRule } from './first-frame.js';
import { ReadyRule, SettledRule } from './lifecycle-milestone.js';
import { BeforeNavigationRule } from './before-navigation.js';

export * from './labels.js';
export * from './first-frame.js';
export * from './lifecycle-milestone.js';
export * from './before-navigation.js';

/**
 * Document-lifecycle rules, in label order.
 *
 * First frame and before-navigation are one-shot per view: every view — a
 * document load or a route change — gets its own pair. The lifecycle milestones
 * are one-shot per document, scoped to its `loaderId`, since only a document
 * load produces them.
 */
export const defaultDocumentRules: readonly MilestoneRule[] = [
  FirstFrameRule,
  ReadyRule,
  SettledRule,
  BeforeNavigationRule,
];
