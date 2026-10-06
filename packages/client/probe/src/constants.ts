/**
 * Names shared by the in-page probe and the host side that installs it.
 *
 * This module is imported by both tiers, so it must stay free of any DOM or
 * Node API — plain constants only.
 */

/** The `Runtime.addBinding` function the probe calls to reach the host. */
export const PROBE_BINDING_NAME = '__uxr_interaction__';

/** Guard flag the probe sets on `window` so a re-injection is a no-op. */
export const PROBE_INJECTED_FLAG = '__uxr_injected__';

/** Longest element text snippet reported with an interaction. */
export const MAX_TEXT_SNIPPET_LENGTH = 40;

/** How many class names contribute to a generated selector. */
export const MAX_SELECTOR_CLASSES = 2;
