import { PRIVACY_BINDING, PRIVACY_DISPOSE, PRIVACY_INSTALL, PRIVACY_STATE } from '../constants.js';
import type { PrivacyDiagnostic, PrivacyProgram, PrivacySnapshot, PrivacyRuleStatus } from '../contract.js';
import { matchesScope, resolveAccessible, textDestination } from './targets.js';

type State = { key: string; snapshot: PrivacySnapshot };
type PrivacyWindow = Window & typeof globalThis & {
  [PRIVACY_BINDING]?: (payload: string) => void;
  [PRIVACY_INSTALL]?: (program: PrivacyProgram) => PrivacySnapshot | undefined;
  [PRIVACY_DISPOSE]?: () => void;
  [PRIVACY_STATE]?: State;
};
const browser = window as PrivacyWindow;

browser[PRIVACY_INSTALL] = (program) => {
  // Standalone injection handles the top document. Frame coverage belongs to integration.
  if (window !== window.top) return;
  const key = JSON.stringify(program);
  const previous = browser[PRIVACY_STATE];
  if (previous) {
    if (previous.key !== key) throw new Error('A different privacy program already ran in this document');
    return previous.snapshot;
  }

  const state: State = { key, snapshot: { status: 'pending', matched: 0, overwritten: 0 } };
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
          node!.textContent = rule.replacement;
          writes += 1;
        }
        status = 'overwritten';
      }
      matched += count;
      overwritten += writes;
      report({ type: 'rule', programId: program.id, ruleId: rule.id, status,
        level: status === 'overwritten' ? 'info' : 'warning', matched: count, overwritten: writes });
    }
    state.snapshot = { status: 'completed', matched, overwritten };
    report({ type: 'completed', programId: program.id, matched, overwritten });
  };

  browser[PRIVACY_DISPOSE] = () => {
    document.removeEventListener('DOMContentLoaded', run);
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
