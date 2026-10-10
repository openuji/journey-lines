/** UJG nodes describe recognition only; actions and page scopes belong to this profile. */
export const PRIVACY_CSS_EXTENSION = 'org.openuji.privacy.css';
export const PRIVACY_CATALOG_CONTEXT = [
  'https://ujg.specs.openuji.org/ed/ns/context.jsonld',
  'https://ujg.specs.openuji.org/ed/ns/surface.context.jsonld',
  'https://ujg.specs.openuji.org/ed/ns/l10n.context.jsonld',
  'https://ujg.specs.openuji.org/ed/ns/observability.context.jsonld',
] as const;

export interface AccessibleLocator {
  readonly '@id': string;
  readonly '@type': 'AccessibleLocator';
  readonly role?: string;
  /** References MessageMeta nodes containing stable interface labels, never identities. */
  readonly accessibleNameRef?: string;
  readonly accessibleDescriptionRef?: string;
  /** Conjunctive surrounding accessible objects (strict DOM ancestors in this adapter). */
  readonly contextLocatorRefs?: readonly string[];
  /** Recognized vocabulary, deliberately unsupported by this adapter. */
  readonly accessibleFeatureRefs?: readonly string[];
  readonly accessibleRelationRefs?: readonly string[];
}

export interface CustomLocator {
  readonly '@id': string;
  readonly '@type': 'CustomLocator';
  readonly extensions: Readonly<Record<string, unknown>>;
}

export type PrivacyCatalogNode = AccessibleLocator | CustomLocator
  | { readonly '@id': string; readonly '@type': 'Locale'; readonly localeCode: string }
  | { readonly '@id': string; readonly '@type': 'MessageMeta' }
  | { readonly '@id': string; readonly '@type': 'Message'; readonly messageMetaRef: string;
      readonly localeRef: string; readonly value: string };

export interface PrivacyPageScope {
  readonly id: string;
  /** Exact HTTP(S) origin; an explicit trailing :* permits any port on that host. */
  readonly origin: string;
  /** Prefixes include a path segment and its descendants, not similarly named siblings. */
  readonly path: { readonly exact: string } | { readonly prefix: string };
}

export type PrivacyTextTarget =
  | { readonly kind: 'leaf' }
  /** Index into childNodes, including whitespace/comments. No content-based selection. */
  | { readonly kind: 'direct-text'; readonly childNodeIndex: number };

export interface PrivacyRuleTarget {
  readonly id: string;
  readonly scopeRefs: readonly string[];
  readonly locatorRef: string;
  readonly allowMultiple?: boolean;
}

export type PrivacyDisplayAttribute = 'aria-label' | 'title' | 'alt' | 'placeholder';
export type PrivacyReplacementRule = PrivacyRuleTarget & (
  | { readonly action?: 'replace-text'; readonly replacement: string; readonly text: PrivacyTextTarget }
  | { readonly action: 'replace-attribute'; readonly replacement: string; readonly attribute: PrivacyDisplayAttribute }
  | { readonly action: 'mask-input' }
);

export type PrivacyMetadataField = 'url' | 'title' | 'text' | 'identifier' | 'link';
/** Static transformations of output only, never a mapping learned from page content. */
export interface PrivacyMetadataRule {
  readonly id: string;
  readonly scopeRefs: readonly string[];
  readonly fields: readonly PrivacyMetadataField[];
  readonly pattern: string;
  readonly flags?: string;
  readonly replacement: string;
}

export interface PrivacyProfile {
  readonly id: string;
  readonly version: string;
  readonly scopes: readonly PrivacyPageScope[];
  /** Local JSON-LD node catalog; compilation never fetches remote contexts or nodes. */
  readonly catalog: {
    readonly '@context': readonly string[];
    readonly '@graph': readonly PrivacyCatalogNode[];
  };
  /** Explicit locale for Message values; no implicit language fallback. */
  readonly localeRef?: string;
  readonly rules: readonly PrivacyReplacementRule[];
  readonly metadata?: readonly PrivacyMetadataRule[];
}
