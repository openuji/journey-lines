import type { PrivacyTextTarget } from './profile.js';

/** Compiled browser instructions; no UJG catalog reaches the runtime. */
export interface PrivacyProgram {
  /** Stable program/version identifier; configuration contains no original identities. */
  readonly id: string;
  readonly profileId?: string;
  readonly rules: readonly PrivacyTextRule[];
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
export type PrivacyTextRule = {
  readonly id: string;
  readonly replacement: string;
  readonly scopes?: readonly PrivacyCompiledScope[];
  readonly text?: PrivacyTextTarget;
  readonly allowMultiple?: boolean;
} & ({ readonly selector: string; readonly target?: never }
  | { readonly target: PrivacyAccessibleTarget; readonly selector?: never });

export type PrivacyRuleStatus =
  | 'overwritten'
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
