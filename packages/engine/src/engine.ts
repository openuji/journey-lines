import type { DomainEvent } from '@openuji/core';
import type { MilestoneRule } from './rule.js';
import {
  initialEngineState,
  reduce,
  type EngineOutput,
  type EngineState,
} from './reduce.js';
import { pathOrHashRoute, type RoutePolicy } from './view.js';

export interface RulesEngineOptions {
  /** Which same-document URL changes start a new view. Default `pathOrHashRoute`. */
  readonly routePolicy?: RoutePolicy;
}

/**
 * Stateful wrapper around the pure `reduce`. All the logic lives in the
 * reducer; this only holds the current state and the rule set, so the engine
 * can be exercised in tests without a browser.
 */
export class RulesEngine {
  private state: EngineState = initialEngineState;
  private readonly rules: readonly MilestoneRule[];
  private readonly routePolicy: RoutePolicy;

  constructor(rules: readonly MilestoneRule[], options: RulesEngineOptions = {}) {
    assertUniqueRuleIds(rules);
    this.rules = rules;
    this.routePolicy = options.routePolicy ?? pathOrHashRoute;
  }

  public get currentState(): EngineState {
    return this.state;
  }

  /** The captures and clip writes `event` produced, for the pipeline to deliver. */
  public processEvent(event: DomainEvent): EngineOutput {
    const { state, captures, clipWrites } = reduce(
      this.state,
      event,
      this.rules,
      this.routePolicy,
    );
    this.state = state;
    return { captures, clipWrites };
  }

  public reset(): void {
    this.state = initialEngineState;
  }
}

/**
 * Rule state is keyed by id, so duplicates would silently share — and corrupt —
 * one slot. Fail loudly at construction instead.
 */
function assertUniqueRuleIds(rules: readonly MilestoneRule[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const rule of rules) {
    if (seen.has(rule.id)) duplicates.add(rule.id);
    seen.add(rule.id);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate milestone rule id(s): ${[...duplicates].join(', ')}`,
    );
  }
}
