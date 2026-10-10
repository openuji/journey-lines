import { PRIVACY_BINDING, PRIVACY_DISPOSE, PRIVACY_INSTALL, PRIVACY_STATE } from '../constants.js';
import type { PrivacyDiagnostic, PrivacyProgram, PrivacySnapshot, PrivacyRuleStatus, PrivacyRendered } from '../contract.js';
import { resolveAccessible, textDestination } from './targets.js';
import { matchesScope } from '../scope.js';

type InstallOptions = { allFrames?: boolean; readiness?: boolean };
type State = { key: string; snapshot: PrivacySnapshot; applicable: number; failed: number;
  documentToken: string; rendered?: PrivacyRendered; cancelPaint?: () => void };
type PrivacyWindow = Window & typeof globalThis & {
  [PRIVACY_BINDING]?: (payload: string) => void;
  [PRIVACY_INSTALL]?: (program: PrivacyProgram, options?: InstallOptions) => PrivacySnapshot | undefined;
  [PRIVACY_DISPOSE]?: () => void;
  [PRIVACY_STATE]?: State;
};
const browser = window as PrivacyWindow;

browser[PRIVACY_INSTALL] = (program, options = {}) => {
  // Standalone injection handles the top document. Frame coverage belongs to integration.
  if (!options.allFrames && window !== window.top) return;
  const key = JSON.stringify(program);
  const previous = browser[PRIVACY_STATE];
  if (previous) {
    if (previous.key !== key) throw new Error('A different privacy program already ran in this document');
    if (options.readiness && previous.snapshot.status === 'completed') renderReady(previous, program.id);
    return previous.snapshot;
  }

  const state: State = { key, snapshot: { status: 'pending', matched: 0, overwritten: 0 },
    applicable: 0, failed: 0, documentToken: crypto.getRandomValues(new Uint32Array(4)).join('-') };
  browser[PRIVACY_STATE] = state;
  const report = (diagnostic: PrivacyDiagnostic): void => {
    browser[PRIVACY_BINDING]?.(JSON.stringify({
      ...diagnostic, ...(program.profileId === undefined ? {} : { profileId: program.profileId }),
    }));
  };

  const run = (): void => {
    if (state.snapshot.status === 'completed') return;
    let matched = 0;
    let overwritten = 0;
    const url = new URL(document.URL);
    const applicable = program.rules.filter((rule) => rule.scopes === undefined ||
      rule.scopes.some((scope) => matchesScope(scope, url)));
    state.applicable = applicable.length;
    // Resolve ALL locators and destinations before writing: accessible names may
    // depend on labels another rule overwrites. No old replacement text is saved.
    const targets = applicable.map((rule) => {
      try {
        const elements = rule.target ? resolveAccessible(rule.target) : [...document.querySelectorAll(rule.selector)];
        return { rule, count: elements.length, destinations: elements.map((element) => textDestination(element, rule)) };
      } catch {
        return { rule, count: 0, error: rule.target ? 'unsupported-locator' as const : 'invalid-selector' as const };
      }
    });
    for (const { rule, count, destinations, error } of targets) {
      let status: PrivacyRuleStatus;
      let writes = 0;
      if (error) status = error;
      else if (count === 0) status = 'unmatched';
      else if (count !== 1 && !rule.allowMultiple) status = 'ambiguous';
      else if (!destinations || destinations.some((node) => node === null)) status = 'unsupported-target';
      else {
        for (const node of destinations) {
          if (rule.action === 'mask-input') {
            // Purely visual. Never touch, inspect or copy the control's value.
            (node as HTMLElement).style.setProperty('-webkit-text-security', 'disc', 'important');
          } else if (rule.action === 'replace-attribute') {
            (node as Element).setAttribute(rule.attribute, rule.replacement);
          } else node!.textContent = rule.replacement;
          writes += 1;
        }
        status = rule.action === 'mask-input' ? 'masked' : 'overwritten';
      }
      if (status !== 'overwritten' && status !== 'masked') state.failed++;
      matched += count;
      overwritten += writes;
      report({ type: 'rule', programId: program.id, ruleId: rule.id, status,
        level: status === 'overwritten' || status === 'masked' ? 'info' : 'warning', matched: count, overwritten: writes });
    }
    state.snapshot = { status: 'completed', matched, overwritten };
    report({ type: 'completed', programId: program.id, matched, overwritten });
    if (options.readiness) renderReady(state, program.id);
  };

  browser[PRIVACY_DISPOSE] = () => {
    document.removeEventListener('DOMContentLoaded', run);
    state.cancelPaint?.();
    // A pending pass has made no writes; a completed marker prevents reapplication.
    if (state.snapshot.status === 'pending') delete browser[PRIVACY_STATE];
    delete browser[PRIVACY_INSTALL];
    delete browser[PRIVACY_DISPOSE];
    delete browser[PRIVACY_BINDING];
  };
  report({ type: 'installed', programId: program.id });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  return state.snapshot;
};

function renderReady(state: State, programId: string): void {
  const report = (value: PrivacyRendered) => browser[PRIVACY_BINDING]?.(JSON.stringify(value));
  if (state.rendered) { report(state.rendered); return; }
  if (state.cancelPaint) return;
  let frame = requestAnimationFrame(() => {
    // The first rendering opportunity after all writes sets the draw boundary.
    // Reporting at the next opportunity lets that paint finish, even on a still page.
    const afterMs = performance.now();
    frame = requestAnimationFrame(() => {
      delete state.cancelPaint;
      state.rendered = { type: 'rendered', programId, documentToken: state.documentToken,
        afterMs, timeOriginMs: performance.timeOrigin, applicable: state.applicable, failed: state.failed };
      report(state.rendered);
    });
  });
  state.cancelPaint = () => { cancelAnimationFrame(frame); delete state.cancelPaint; };
}
