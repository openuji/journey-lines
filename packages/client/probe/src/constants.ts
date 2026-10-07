/**
 * Names shared by the in-page probe and the host side that installs it.
 *
 * This module is imported by both tiers, so it must stay free of any DOM or
 * Node API — plain constants only.
 */

/** The `Runtime.addBinding` function the probe calls to reach the host. */
export const PROBE_BINDING_NAME = '__uxr_probe__';

/**
 * Where the probe keeps how to uninstall it, on `window`: its presence means
 * the probe is installed, so a re-injection is a no-op. The host calls it when
 * the recording stops.
 */
export const PROBE_UNINSTALL = '__uxr_uninstall__';

/** Longest element text snippet reported with an interaction. */
export const MAX_TEXT_SNIPPET_LENGTH = 40;

/** How many class names contribute to a generated selector. */
export const MAX_SELECTOR_CLASSES = 2;
