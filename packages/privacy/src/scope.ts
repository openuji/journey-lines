import type { PrivacyCompiledScope } from './contract.js';

export function matchesScope(scope: PrivacyCompiledScope, url: URL): boolean {
  const origin = scope.anyPort ? `${url.protocol}//${url.hostname}` : url.origin;
  if (origin !== scope.origin) return false;
  const { kind, value } = scope.path;
  return kind === 'exact' ? url.pathname === value : url.pathname === value ||
    url.pathname.startsWith(value.endsWith('/') ? value : `${value}/`);
}
