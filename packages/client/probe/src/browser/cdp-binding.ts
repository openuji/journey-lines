/**
 * CDP delivery entry for the probe — what `PROBE_SOURCE` is bundled from.
 *
 * Injected via `Page.addScriptToEvaluateOnNewDocument` (and `Runtime.evaluate`
 * for a document already showing). Reports through the `Runtime.addBinding`
 * function, JSON-encoded: Chrome turns each call into a `Runtime.bindingCalled`
 * event, in the same ordered CDP event stream as the compositor frames. Works
 * under any CDP host: Puppeteer, Electron, or an extension through
 * `chrome.debugger`.
 */

import { PROBE_BINDING_NAME } from '../constants.js';
import { installProbe } from './install.js';

installProbe((payload) => {
  const send = window[PROBE_BINDING_NAME];
  if (typeof send !== 'function') {
    // The binding has not landed yet — drop rather than buffer, matching the
    // host side's expectation that the probe is fire-and-forget.
    return;
  }

  send(JSON.stringify(payload));
});
