import { describe, expect, it } from 'vitest';
import { compilePrivacy, privacyProfileFromDocument, PrivacyCompileError } from '@openuji/privacy';
import { css, profile, rule } from './fixtures.js';

const { catalog, ...settings } = profile([css('name', '#name')], [rule('name')]);
const document = {
  '@id': 'urn:privacy:test:profiles', '@type': 'UJGDocument',
  '@context': catalog['@context'], nodes: catalog['@graph'],
  extensions: { 'org.openuji.privacy': settings },
};

describe('privacy JSON-LD documents', () => {
  it('preserves compiled rules and ignores unrelated opaque extensions', () => {
    const source = { ...document, extensions: { ...document.extensions, 'example.unrelated': { rules: [] } } };
    expect(compilePrivacy(privacyProfileFromDocument(source))).toEqual(compilePrivacy({ ...settings, catalog }));
  });

  it.each([
    null,
    { ...document, '@type': 'CustomLocator' },
    { ...document, '@id': 'not-an-iri' },
    { ...document, imports: ['https://example.test/other.jsonld'] },
    { ...document, extensions: {} },
    { ...document, extensions: { 'org.openuji.privacy': { ...settings, catalog } } },
    { ...document, nodes: [] },
    { ...document, '@context': ['https://example.test/context.jsonld'] },
  ])('rejects invalid or unsupported documents instead of weakening rules', (source) => {
    expect(() => privacyProfileFromDocument(source)).toThrow(PrivacyCompileError);
  });
});
