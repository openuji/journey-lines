import type { PrivacyCounts, PrivacyDiagnostic, PrivacyProgram, PrivacySnapshot } from './contract.js';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function counts(value: Record<string, unknown>): PrivacyCounts | null {
  const { matched, overwritten } = value;
  return typeof matched === 'number' && Number.isSafeInteger(matched) && matched >= 0 &&
    typeof overwritten === 'number' && Number.isSafeInteger(overwritten) && overwritten >= 0 && overwritten <= matched
    ? { matched, overwritten } : null;
}

/** Reconstruct the allowlisted shape; do not forward extra fields supplied by a page. */
export function decodeDiagnostic(payload: string, program: PrivacyProgram): PrivacyDiagnostic | null {
  let value: unknown;
  try { value = JSON.parse(payload); } catch { return null; }
  if (!object(value) || value.programId !== program.id) return null;
  const programId = program.id;
  const profile = program.profileId === undefined ? {} : { profileId: program.profileId };
  if (value.type === 'installed') return { type: 'installed', programId, ...profile };
  const total = counts(value);
  if (!total) return null;
  if (value.type === 'completed') return { type: 'completed', programId, ...profile, ...total };
  if (value.type !== 'rule' || !program.rules.some((rule) => rule.id === value.ruleId)) return null;
  const { status } = value;
  if (status !== 'overwritten' && status !== 'unmatched' && status !== 'ambiguous' &&
      status !== 'invalid-selector' && status !== 'unsupported-locator' && status !== 'unsupported-target') return null;
  return { type: 'rule', programId, ...profile, ruleId: value.ruleId as string, status,
    level: status === 'overwritten' ? 'info' : 'warning', ...total };
}

export function decodeSnapshot(value: unknown): PrivacySnapshot | null {
  if (!object(value) || (value.status !== 'pending' && value.status !== 'completed')) return null;
  const total = counts(value);
  return total ? { status: value.status, ...total } : null;
}
