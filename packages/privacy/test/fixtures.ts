import { PRIVACY_CATALOG_CONTEXT, PRIVACY_CSS_EXTENSION,
  type PrivacyCatalogNode, type PrivacyProfile, type PrivacyReplacementRule } from '@journey-lines/privacy';

export const locatorId = (id: string) => `urn:privacy:test:${id}`;
export function css(id: string, selector: string): PrivacyCatalogNode {
  return { '@id': locatorId(id), '@type': 'CustomLocator', extensions: { [PRIVACY_CSS_EXTENSION]: { selector } } };
}
export function label(id: string, value: string): PrivacyCatalogNode[] {
  return [
    { '@id': locatorId(id), '@type': 'MessageMeta' },
    { '@id': locatorId(`${id}.en`), '@type': 'Message', messageMetaRef: locatorId(id), localeRef: locatorId('en'), value },
  ];
}
export function rule(id: string, options: Partial<Extract<PrivacyReplacementRule, { replacement: string; text: unknown }>> = {}): PrivacyReplacementRule {
  return { id, locatorRef: locatorId(id), scopeRefs: ['page'], replacement: 'Don Joe', text: { kind: 'leaf' }, ...options };
}
export function profile(nodes: readonly PrivacyCatalogNode[], rules: readonly PrivacyReplacementRule[]): PrivacyProfile {
  return {
    id: 'synthetic', version: '1', localeRef: locatorId('en'),
    scopes: [{ id: 'page', origin: 'http://127.0.0.1:*', path: { prefix: '/' } }],
    catalog: { '@context': PRIVACY_CATALOG_CONTEXT, '@graph': [
      { '@id': locatorId('en'), '@type': 'Locale', localeCode: 'en' }, ...nodes,
    ] }, rules,
  };
}
