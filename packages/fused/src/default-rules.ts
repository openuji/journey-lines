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
 * order: a scroll and a click that come to rest at the same `quiet` give
 * `03`/`04` before `10`/`11`. A click's pictures are decided once its response
 * has come to rest, so they follow the `00-first` of a route it opened. A
 * click still open when the recording stops gives its `10` before the view's
 * `99-before-navigation`.
 */
export const defaultRules: readonly MilestoneRule[] = [
  FirstFrameRule, // 00
  ReadyRule, // 01
  SettledRule, // 02
  ...defaultInteractionRules, // 03–04 scroll, 10–11 click
  BeforeNavigationRule, // 99
];
