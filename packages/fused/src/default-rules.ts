import type { MilestoneRule } from '@openuji/engine';
import {
  BeforeNavigationRule,
  FirstFrameRule,
  ReadyRule,
  SettledRule,
} from '@openuji/rules-document';
import { defaultInteractionRules } from '@openuji/rules-interaction';

/**
 * The standard rule suite, in label order.
 *
 * Within one event, captures come out in rule order, so rule order is label
 * order. The first frame of a route a click just opened is the route's
 * `00-first` before it is the click's `11-post-click`. A scroll still open
 * when the view ends is flushed (`03`/`04`) before the view's
 * `99-before-navigation`.
 */
export const defaultRules: readonly MilestoneRule[] = [
  FirstFrameRule, // 00
  ReadyRule, // 01
  SettledRule, // 02
  ...defaultInteractionRules, // 03–04 scroll, 10–11 click
  BeforeNavigationRule, // 99
];
