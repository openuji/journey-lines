/**
 * Globals CDP installs into the page, plus the probe's own uninstall.
 * Declared rather than feature-probed so the browser tier typechecks.
 */

declare global {
  interface Window {
    /** Set by the probe itself (`PROBE_UNINSTALL`); a second injection sees it and bails. */
    __uxr_uninstall__?: () => void;
    /** Installed by CDP `Runtime.addBinding` (`PROBE_BINDING_NAME`); absent until the binding lands. */
    __uxr_probe__?: (payload: string) => void;
  }
}

export {};
