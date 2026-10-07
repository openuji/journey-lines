import type {
  ClipWrite,
  CompositorFrame,
  DomainEvent,
  MilestoneCapture,
  ViewState,
} from '@openuji/core';

export interface RuleContext {
  readonly currentView: ViewState;
  /**
   * The last frame the engine has finished processing — i.e. the resting state
   * *before* the current event. Rules capturing a "pre-" milestone use this.
   */
  readonly lastFrame: CompositorFrame | null;
  /** The frame carried by this event, or null for non-frame events. */
  readonly currentFrame: CompositorFrame | null;
}

/**
 * What a rule decided about one event. Everything that should happen outside
 * the engine is in here, as data: the pipeline delivers captures to the
 * capture sinks and clip writes to the clip sink. A rule never calls a sink.
 */
export interface RuleResult<TState> {
  readonly nextState: TState;
  readonly captures: readonly MilestoneCapture[];
  /** Frames of a span this rule follows, for a video of it. Most rules have none. */
  readonly clipWrites?: readonly ClipWrite[];
}

/**
 * A pluggable milestone detector.
 *
 * `TState` is opaque to the engine: it is stored keyed by `id` and handed back
 * to the same rule untouched, so no rule can observe or corrupt another's
 * state. That is why the default is `unknown` rather than `any`.
 */
export interface MilestoneRule<TState = unknown> {
  readonly id: string;

  /**
   * Build state for a view that just began.
   *
   * `previous` is this rule's state from the view just left, after it saw
   * `view-exit`; absent for the first view. A rule starts fresh by ignoring it,
   * or carries over what is still owed — a capture waiting for its next frame.
   */
  init(view: ViewState, previous?: TState): TState;

  /** Pure evaluation of a domain event against current state. */
  evaluate(
    state: TState,
    event: DomainEvent,
    ctx: RuleContext,
  ): RuleResult<TState>;
}

/** No state change, nothing captured — the common case in every rule. */
export function unchanged<TState>(state: TState): RuleResult<TState> {
  return { nextState: state, captures: EMPTY_CAPTURES };
}

/** What a rule decides about a capture: everything but whose it is. */
export type CaptureFields = Pick<
  MilestoneCapture,
  'label' | 'frame' | 'detail' | 'domTarget' | 'scrollEpisode'
>;

/**
 * A capture belonging to `view`. Rules say what they saw; which view it is
 * filed under is decided here alone.
 */
export function captureFor(
  view: ViewState,
  fields: CaptureFields,
): MilestoneCapture {
  return {
    viewId: view.id,
    entry: view.entry,
    documentId: view.documentId,
    loaderId: view.loaderId,
    url: view.url,
    ...fields,
  };
}

const EMPTY_CAPTURES: readonly MilestoneCapture[] = Object.freeze([]);
