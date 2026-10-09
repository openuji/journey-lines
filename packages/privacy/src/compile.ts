import type { PrivacyAccessibleTarget, PrivacyCompiledScope, PrivacyProgram, PrivacyTextRule } from './contract.js';
import { PRIVACY_CATALOG_CONTEXT, PRIVACY_CSS_EXTENSION, type PrivacyProfile } from './profile.js';

export type PrivacyCompileStatus = 'invalid-profile' | 'invalid-scope' | 'invalid-rule'
  | 'invalid-reference' | 'invalid-message' | 'unsupported-locator';
export interface PrivacyCompileDiagnostic {
  readonly profileId: string;
  readonly ruleId?: string;
  readonly status: PrivacyCompileStatus;
  readonly level: 'error';
}

export class PrivacyCompileError extends Error {
  constructor(readonly diagnostics: readonly PrivacyCompileDiagnostic[]) {
    super('Privacy profile compilation failed');
    this.name = 'PrivacyCompileError';
  }
}

class Invalid extends Error {
  constructor(readonly status: PrivacyCompileStatus) { super(status); }
}
function require(value: unknown, status: PrivacyCompileStatus): asserts value {
  if (!value) throw new Invalid(status);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function iri(value: unknown): value is string {
  return string(value) && /^[a-z][a-z\d+.-]*:\S+$/i.test(value);
}
function keys(value: unknown, allowed: readonly string[], status: PrivacyCompileStatus): asserts value is Record<string, unknown> {
  require(object(value) && Object.keys(value).every((key) => allowed.includes(key)), status);
}
function refs(value: unknown, status: PrivacyCompileStatus): asserts value is string[] {
  require(Array.isArray(value) && value.length > 0 && value.every(string), status);
}
function index(values: unknown, status: PrivacyCompileStatus, idKey = 'id'): Map<string, Record<string, unknown>> {
  require(Array.isArray(values), status);
  const result = new Map<string, Record<string, unknown>>();
  for (const value of values) {
    require(object(value) && string(value[idKey]) && !result.has(value[idKey]), status);
    result.set(value[idKey], value);
  }
  return result;
}

function scope(value: Record<string, unknown>): PrivacyCompiledScope {
  keys(value, ['id', 'origin', 'path'], 'invalid-scope');
  require(string(value.origin), 'invalid-scope');
  const anyPort = value.origin.endsWith(':*');
  const origin = anyPort ? value.origin.slice(0, -2) : value.origin;
  let url: URL;
  try { url = new URL(origin); } catch { throw new Invalid('invalid-scope'); }
  require(['http:', 'https:'].includes(url.protocol) && url.origin === origin &&
    !url.username && !url.password && !url.hostname.includes('*') && (!anyPort || !url.port), 'invalid-scope');
  keys(value.path, ['exact', 'prefix'], 'invalid-scope');
  require(Object.keys(value.path).length === 1, 'invalid-scope');
  const kind = 'exact' in value.path ? 'exact' : 'prefix';
  const path = value.path[kind];
  require(string(path) && path.startsWith('/') && !/[?#\\]/.test(path), 'invalid-scope');
  // Reject paths URL parsing would normalize into a different route.
  require(new URL(origin + path).pathname === path, 'invalid-scope');
  return { origin, anyPort, path: { kind, value: path } };
}

/** Pure, fail-closed compilation. Errors contain IDs/codes, never locator values or content. */
export function compilePrivacy(profile: PrivacyProfile): PrivacyProgram {
  const profileId = object(profile) && string(profile.id) ? profile.id : 'unknown';
  const diagnostic = (status: PrivacyCompileStatus, ruleId?: string): PrivacyCompileDiagnostic =>
    ({ profileId, ...(ruleId === undefined ? {} : { ruleId }), status, level: 'error' });
  try {
    keys(profile, ['id', 'version', 'scopes', 'catalog', 'localeRef', 'rules'], 'invalid-profile');
    require(string(profile.id) && string(profile.version), 'invalid-profile');
    const scopes = new Map([...index(profile.scopes, 'invalid-scope')].map(([id, value]) => [id, scope(value)]));
    require(scopes.size > 0, 'invalid-scope');
    keys(profile.catalog, ['@context', '@graph'], 'invalid-profile');
    const contexts = profile.catalog['@context'];
    require(Array.isArray(contexts) && contexts.length === PRIVACY_CATALOG_CONTEXT.length &&
      contexts.every((context, i) => context === PRIVACY_CATALOG_CONTEXT[i]), 'invalid-profile');
    const nodes = index(profile.catalog['@graph'], 'invalid-profile', '@id');
    for (const [id, node] of nodes) {
      require(iri(id), 'invalid-profile');
      switch (node['@type']) {
        case 'AccessibleLocator': case 'CustomLocator': break; // Validated with the referencing rule below.
        case 'Locale':
          keys(node, ['@id', '@type', 'localeCode'], 'invalid-message');
          require(string(node.localeCode), 'invalid-message');
          break;
        case 'MessageMeta': keys(node, ['@id', '@type'], 'invalid-message'); break;
        case 'Message':
          keys(node, ['@id', '@type', 'messageMetaRef', 'localeRef', 'value'], 'invalid-message');
          require(typeof node.value === 'string' && typeof node.messageMetaRef === 'string' &&
            nodes.get(node.messageMetaRef)?.['@type'] === 'MessageMeta' && typeof node.localeRef === 'string' &&
            nodes.get(node.localeRef)?.['@type'] === 'Locale', 'invalid-message');
          break;
        default: throw new Invalid('unsupported-locator');
      }
    }
    if (profile.localeRef !== undefined) require(nodes.get(profile.localeRef)?.['@type'] === 'Locale', 'invalid-message');

    const message = (ref: unknown): string => {
      require(typeof ref === 'string' && nodes.get(ref)?.['@type'] === 'MessageMeta', 'invalid-reference');
      require(profile.localeRef !== undefined, 'invalid-message');
      const messages = [...nodes.values()].filter((node) => node['@type'] === 'Message' &&
        node.messageMetaRef === ref && node.localeRef === profile.localeRef);
      require(messages.length === 1, 'invalid-message');
      return messages[0]!.value as string;
    };

    const accessible = (ref: string, ancestors = new Set<string>()): PrivacyAccessibleTarget => {
      require(!ancestors.has(ref), 'unsupported-locator');
      const node = nodes.get(ref);
      require(node, 'invalid-reference');
      require(node['@type'] === 'AccessibleLocator', 'unsupported-locator');
      keys(node, ['@id', '@type', 'role', 'accessibleNameRef', 'accessibleDescriptionRef', 'contextLocatorRefs'], 'unsupported-locator');
      require(['role', 'accessibleNameRef', 'accessibleDescriptionRef', 'contextLocatorRefs'].some((key) => node[key] !== undefined), 'unsupported-locator');
      if (node.role !== undefined) require(string(node.role) && /^[a-z][a-z-]*$/.test(node.role), 'unsupported-locator');
      const nextAncestors = new Set(ancestors).add(ref);
      let surrounding: PrivacyAccessibleTarget[] = [];
      if (node.contextLocatorRefs !== undefined) {
        refs(node.contextLocatorRefs, 'unsupported-locator');
        surrounding = node.contextLocatorRefs.map((context) => accessible(context, nextAncestors));
      }
      return {
        kind: 'accessible',
        ...(node.role === undefined ? {} : { role: node.role as string }),
        ...(node.accessibleNameRef === undefined ? {} : { name: message(node.accessibleNameRef) }),
        ...(node.accessibleDescriptionRef === undefined ? {} : { description: message(node.accessibleDescriptionRef) }),
        contexts: surrounding,
      };
    };

    const rules: PrivacyTextRule[] = [];
    const errors: PrivacyCompileDiagnostic[] = [];
    for (const [id, rule] of index(profile.rules, 'invalid-rule')) {
      try {
        keys(rule, ['id', 'scopeRefs', 'locatorRef', 'replacement', 'text', 'allowMultiple'], 'invalid-rule');
        refs(rule.scopeRefs, 'invalid-scope');
        const ruleScopes = rule.scopeRefs.map((ref) => {
          const found = scopes.get(ref);
          require(found, 'invalid-reference');
          return found;
        });
        require(typeof rule.replacement === 'string' &&
          (rule.allowMultiple === undefined || typeof rule.allowMultiple === 'boolean'), 'invalid-rule');
        keys(rule.text, ['kind', 'childNodeIndex'], 'invalid-rule');
        require(rule.text.kind === 'leaf' ? !('childNodeIndex' in rule.text) :
          rule.text.kind === 'direct-text' && Number.isSafeInteger(rule.text.childNodeIndex) &&
            (rule.text.childNodeIndex as number) >= 0, 'invalid-rule');
        const text = rule.text.kind === 'leaf' ? { kind: 'leaf' as const } :
          { kind: 'direct-text' as const, childNodeIndex: rule.text.childNodeIndex as number };
        require(typeof rule.locatorRef === 'string', 'invalid-reference');
        const node = nodes.get(rule.locatorRef);
        require(node, 'invalid-reference');
        let target: { selector: string } | { target: PrivacyAccessibleTarget };
        if (node['@type'] === 'CustomLocator') {
          keys(node, ['@id', '@type', 'extensions'], 'unsupported-locator');
          keys(node.extensions, [PRIVACY_CSS_EXTENSION], 'unsupported-locator');
          const extension = node.extensions[PRIVACY_CSS_EXTENSION];
          keys(extension, ['selector'], 'unsupported-locator');
          require(string(extension.selector), 'unsupported-locator');
          target = { selector: extension.selector };
        } else target = { target: accessible(rule.locatorRef) };
        rules.push({ id, scopes: ruleScopes, ...target, replacement: rule.replacement,
          text, allowMultiple: rule.allowMultiple === true });
      } catch (error) {
        if (!(error instanceof Invalid)) throw error;
        errors.push(diagnostic(error.status, id));
      }
    }
    if (errors.length) throw new PrivacyCompileError(errors);
    return { id: `${profile.id}@${profile.version}`, profileId: profile.id, rules };
  } catch (error) {
    if (error instanceof Invalid) throw new PrivacyCompileError([diagnostic(error.status)]);
    throw error;
  }
}
