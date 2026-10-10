import type { PrivacyTextTarget, PrivacyDisplayAttribute, PrivacyMetadataField } from './profile.js';

/** Compiled browser instructions; no UJG catalog reaches the runtime. */
export interface PrivacyProgram {
  /** Stable program/version identifier; configuration contains no original identities. */
  readonly id: string;
  readonly profileId?: string;
  readonly rules: readonly PrivacyRule[];
  /** Host-side output transformations; excluded from the injected configuration. */
  readonly metadata?: readonly PrivacyCompiledMetadataRule[];
}

export interface PrivacyCompiledMetadataRule {
  readonly id: string;
  readonly scopes: readonly PrivacyCompiledScope[];
  readonly fields: readonly PrivacyMetadataField[];
  readonly pattern: string;
  readonly flags: string;
  readonly replacement: string;
}

export interface PrivacyCompiledScope {
  readonly origin: string;
  readonly anyPort: boolean;
  readonly path: { readonly kind: 'exact' | 'prefix'; readonly value: string };
}

export interface PrivacyAccessibleTarget {
  readonly kind: 'accessible';
  readonly role?: string;
  readonly name?: string;
  readonly description?: string;
  readonly contexts: readonly PrivacyAccessibleTarget[];
}

/** Legacy CSS instructions remain usable; compiled profiles supply explicit scopes/text. */
type RuleTarget = {
  readonly id: string;
  readonly scopes?: readonly PrivacyCompiledScope[];
  readonly allowMultiple?: boolean;
} & ({ readonly selector: string; readonly target?: never }
  | { readonly target: PrivacyAccessibleTarget; readonly selector?: never });

export type PrivacyTextRule = RuleTarget & {
  readonly action?: 'replace-text';
  readonly replacement: string;
  readonly text?: PrivacyTextTarget;
};
export type PrivacyRule = PrivacyTextRule
  | (RuleTarget & { readonly action: 'replace-attribute'; readonly replacement: string; readonly attribute: PrivacyDisplayAttribute })
  | (RuleTarget & { readonly action: 'mask-input' });

/** Internal readiness evidence; never includes page values, URLs or titles. */
export interface PrivacyRendered {
  readonly type: 'rendered';
  readonly programId: string;
  readonly documentToken: string;
  readonly afterMs: number;
  readonly timeOriginMs: number;
  readonly applicable: number;
  readonly failed: number;
}

export type PrivacyRuleStatus =
  | 'overwritten'
  | 'masked'
  | 'unmatched'
  | 'ambiguous'
  | 'invalid-selector'
  | 'unsupported-locator'
  | 'unsupported-target';

export interface PrivacyCounts {
  readonly matched: number;
  readonly overwritten: number;
}

export type PrivacyDiagnostic = { readonly profileId?: string } & (
  | { readonly type: 'installed'; readonly programId: string }
  | ({ readonly type: 'rule'; readonly programId: string; readonly ruleId: string;
       readonly status: PrivacyRuleStatus; readonly level: 'info' | 'warning' } & PrivacyCounts)
  | ({ readonly type: 'completed'; readonly programId: string } & PrivacyCounts));

/** A cancelled initial document never masquerades as a completed privacy pass. */
export type PrivacyInitialResult =
  | ({ readonly status: 'completed' } & PrivacyCounts)
  | { readonly status: 'cancelled'; readonly reason: 'disposed' | 'document-replaced' };

/** Only configuration and counts cross the binding; no page content or exceptions. */
export interface PrivacySnapshot extends PrivacyCounts {
  readonly status: 'pending' | 'completed';
}
