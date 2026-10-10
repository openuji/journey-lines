export const STORAGE_KEY = 'privacy-collector-state';

export const PROFILE_CONTEXT = [
  'https://ujg.specs.openuji.org/ed/ns/context.jsonld',
  'https://ujg.specs.openuji.org/ed/ns/surface.context.jsonld',
  'https://ujg.specs.openuji.org/ed/ns/l10n.context.jsonld',
  'https://ujg.specs.openuji.org/ed/ns/observability.context.jsonld',
] as const;

export type ScopeMode = 'exact' | 'prefix' | 'origin';
export type CollectorAction = 'replace-text' | 'mask-input' | 'replace-attribute';
export type DisplayAttribute = 'aria-label' | 'title' | 'alt' | 'placeholder';
export type TextTarget = { readonly kind: 'leaf' }
  | { readonly kind: 'direct-text'; readonly childNodeIndex: number };

export interface CollectedSlot {
  readonly id: string;
  readonly selector: string;
  readonly action: CollectorAction;
  readonly replacement?: string;
  readonly attribute?: DisplayAttribute;
  readonly text?: TextTarget;
  readonly allowMultiple?: boolean;
  readonly matchCount: number;
  readonly tagName: string;
  readonly scope: {
    readonly origin: string;
    readonly mode: ScopeMode;
    readonly path: string;
  };
}

export interface CollectorState {
  readonly tenant: string;
  readonly slots: readonly CollectedSlot[];
}

export const EMPTY_STATE: CollectorState = { tenant: 'tenant', slots: [] };

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function normalizeIdentifier(value: string, fallback = 'slot'): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z]+/, '').replace(/[._-]+$/g, '');
  return identifier.test(normalized) ? normalized : fallback;
}

export function defaultTenant(hostname: string): string {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  const candidate = parts.length > 2 ? parts.at(-3)! : parts[0] ?? 'tenant';
  return normalizeIdentifier(candidate, 'tenant').replaceAll('.', '-');
}

export function defaultScope(pathname: string): { mode: ScopeMode; path: string } {
  const path = pathname.startsWith('/') ? pathname : '/';
  const sessionAt = path.search(/;(?:__Host-)?JSESSIONID=/i);
  if (sessionAt < 0) return { mode: 'exact', path };
  const stablePart = path.slice(0, sessionAt);
  const parent = stablePart.slice(0, stablePart.lastIndexOf('/')) || '/';
  return { mode: 'prefix', path: parent };
}

export function parseState(value: unknown): CollectorState {
  if (!object(value) || typeof value.tenant !== 'string' || !identifier.test(value.tenant) ||
      !Array.isArray(value.slots)) return EMPTY_STATE;
  const slots = value.slots.filter(isSlot);
  return slots.length === value.slots.length ? { tenant: value.tenant, slots } : EMPTY_STATE;
}

export function validateSlot(value: unknown): CollectedSlot {
  if (!isSlot(value)) throw new Error('The collected privacy slot is invalid.');
  return value;
}

function isSlot(value: unknown): value is CollectedSlot {
  if (!object(value) || typeof value.id !== 'string' || !identifier.test(value.id) ||
      typeof value.selector !== 'string' || value.selector.trim() === '' ||
      !['replace-text', 'mask-input', 'replace-attribute'].includes(value.action as string) ||
      typeof value.matchCount !== 'number' || !Number.isSafeInteger(value.matchCount) || value.matchCount < 1 ||
      typeof value.tagName !== 'string' || !/^[a-z][a-z0-9-]*$/.test(value.tagName) ||
      !object(value.scope) || typeof value.scope.origin !== 'string' ||
      !['exact', 'prefix', 'origin'].includes(value.scope.mode as string) ||
      typeof value.scope.path !== 'string' || !value.scope.path.startsWith('/')) return false;
  try {
    const url = new URL(value.scope.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.scope.origin) return false;
  } catch { return false; }
  if (value.allowMultiple !== undefined && typeof value.allowMultiple !== 'boolean') return false;
  if (value.action === 'mask-input') return value.replacement === undefined && value.attribute === undefined && value.text === undefined;
  if (typeof value.replacement !== 'string') return false;
  if (value.action === 'replace-attribute') {
    return ['aria-label', 'title', 'alt', 'placeholder'].includes(value.attribute as string) && value.text === undefined;
  }
  return value.attribute === undefined && object(value.text) && (value.text.kind === 'leaf' ||
    value.text.kind === 'direct-text' && Number.isSafeInteger(value.text.childNodeIndex) &&
      (value.text.childNodeIndex as number) >= 0);
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

export function buildProfileDocument(stateValue: unknown): Record<string, unknown> {
  const state = parseState(stateValue);
  if (state.slots.length === 0) throw new Error('Collect at least one privacy slot before exporting.');
  const scopes = new Map<string, { id: string; origin: string; path: { exact: string } | { prefix: string } }>();
  const rules: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];

  for (const slot of state.slots) {
    const key = `${slot.scope.origin}|${slot.scope.mode}|${slot.scope.path}`;
    let scope = scopes.get(key);
    if (!scope) {
      const path = slot.scope.mode === 'exact'
        ? { exact: slot.scope.path }
        : { prefix: slot.scope.mode === 'origin' ? '/' : slot.scope.path };
      scope = { id: `scope-${hash(key)}`, origin: slot.scope.origin, path };
      scopes.set(key, scope);
    }
    const locatorRef = `urn:privacy:${state.tenant}:${slot.id}`;
    nodes.push({
      '@id': locatorRef,
      '@type': 'CustomLocator',
      extensions: { 'org.openuji.privacy.css': { selector: slot.selector } },
    });
    const rule: Record<string, unknown> = {
      id: `${state.tenant}.${slot.id}`,
      scopeRefs: [scope.id],
      locatorRef,
      ...(slot.allowMultiple ? { allowMultiple: true } : {}),
      action: slot.action,
    };
    if (slot.action === 'replace-text') Object.assign(rule, { replacement: slot.replacement, text: slot.text });
    if (slot.action === 'replace-attribute') Object.assign(rule, {
      replacement: slot.replacement, attribute: slot.attribute,
    });
    rules.push(rule);
  }

  return {
    '@context': [...PROFILE_CONTEXT],
    '@id': `urn:privacy:${state.tenant}:profiles`,
    '@type': 'UJGDocument',
    extensions: {
      'org.openuji.privacy': {
        id: state.tenant,
        version: '0.1.0-collected',
        scopes: [...scopes.values()],
        rules,
        metadata: [],
      },
    },
    nodes,
  };
}
