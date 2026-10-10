import { describe, expect, it } from 'vitest';
import { compilePrivacy, PrivacyCompileError, type PrivacyProfile, type PrivacyTextRule } from '@openuji/privacy';
import { css, label, locatorId, profile, rule } from './fixtures.js';

const dummyProfile = profile([css('name', '#identity')], [rule('name')]);

function errors(value: unknown) {
  try { compilePrivacy(value as PrivacyProfile); }
  catch (error) {
    expect(error).toBeInstanceOf(PrivacyCompileError);
    return (error as PrivacyCompileError).diagnostics;
  }
  throw new Error('Expected compilation to fail');
}

describe('compilePrivacy', () => {
  it('compiles a selector/replacement without shipping its catalog', () => {
    const before = JSON.stringify(dummyProfile);
    const program = compilePrivacy(dummyProfile);
    expect(program).toEqual({
      id: 'synthetic@1', profileId: 'synthetic', rules: [{
        id: 'name', selector: '#identity', replacement: 'Don Joe',
        scopes: [{ origin: 'http://127.0.0.1', anyPort: true, path: { kind: 'prefix', value: '/' } }],
        text: { kind: 'leaf' }, allowMultiple: false,
      }],
    });
    expect(JSON.stringify(dummyProfile)).toBe(before);
    expect(compilePrivacy(dummyProfile)).toEqual(program);
  });

  it('resolves UJG names/descriptions in the explicit locale and preserves conjunctive contexts', () => {
    const source = profile([
      ...label('name', 'Account holder'), ...label('description', 'Public display name'),
      { '@id': locatorId('region'), '@type': 'AccessibleLocator', role: 'region' },
      { '@id': locatorId('group'), '@type': 'AccessibleLocator', role: 'group' },
      { '@id': locatorId('name.de'), '@type': 'Message', messageMetaRef: locatorId('name'), localeRef: locatorId('de'), value: 'Kontoinhaber' },
      { '@id': locatorId('description.de'), '@type': 'Message', messageMetaRef: locatorId('description'), localeRef: locatorId('de'), value: 'Anzeigename' },
      { '@id': locatorId('de'), '@type': 'Locale', localeCode: 'de' },
      { '@id': locatorId('heading'), '@type': 'AccessibleLocator', role: 'heading',
        accessibleNameRef: locatorId('name'), accessibleDescriptionRef: locatorId('description'),
        contextLocatorRefs: [locatorId('region'), locatorId('group')] },
    ], [rule('heading')]);
    expect(compilePrivacy(source).rules[0]?.target).toEqual({
      kind: 'accessible', role: 'heading', name: 'Account holder', description: 'Public display name',
      contexts: [{ kind: 'accessible', role: 'region', contexts: [] }, { kind: 'accessible', role: 'group', contexts: [] }],
    });
    expect(compilePrivacy({ ...source, localeRef: locatorId('de'), rules: [rule('heading')] }).rules).toBeDefined();
  });

  it('copies output so neither caller mutations nor program mutations change the profile', () => {
    const source = profile([css('name', '#identity')], [rule('name', { allowMultiple: true, text: { kind: 'direct-text', childNodeIndex: 0 } })]);
    const before = JSON.stringify(source);
    const program = compilePrivacy(source);
    ((program.rules[0]! as PrivacyTextRule).text as { childNodeIndex: number }).childNodeIndex = 2;
    (program.rules[0]!.scopes![0]!.path as { value: string }).value = '/changed';
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([
    { role: 'heading', accessibleFeatureRefs: ['urn:feature:checked'] },
    { role: 'heading', accessibleRelationRefs: ['urn:relation:labelled-by'] },
    { role: 'heading', selector: '#private-value' },
    { role: 'heading', extensions: { private: { name: 'private-value' } } },
    { role: 'heading', contextLocatorRefs: [] },
    { role: 'heading', contextLocatorRefs: [locatorId('heading')] },
    { role: 'heading button' },
    { role: undefined },
    {},
  ])('rejects unsupported accessible constraints without a partial/broader program: %j', (fields) => {
    const source = profile([{ '@id': locatorId('heading'), '@type': 'AccessibleLocator', ...fields }], [rule('heading')]);
    expect(errors(source)).toEqual([{ profileId: 'synthetic', ruleId: 'heading', status: 'unsupported-locator', level: 'error' }]);
    expect(JSON.stringify(errors(source))).not.toContain('private-value');
  });

  it('rejects a custom context instead of dropping it', () => {
    expect(errors(profile([
      css('context', '#context'),
      { '@id': locatorId('heading'), '@type': 'AccessibleLocator', role: 'heading', contextLocatorRefs: [locatorId('context')] },
    ], [rule('heading')]))[0]?.status).toBe('unsupported-locator');
  });

  it.each([
    { 'unknown.css': { selector: '#identity' } },
    { 'org.openuji.privacy.css': { selector: '#identity', filter: 'private-value' } },
    { 'org.openuji.privacy.css': { selector: '#identity' }, 'unknown.constraint': {} },
  ])('rejects unsupported CSS extensions: %j', (extensions) => {
    expect(errors(profile([{ '@id': locatorId('name'), '@type': 'CustomLocator', extensions }], [rule('name')]))[0]?.status).toBe('unsupported-locator');
  });

  it('collects rule diagnostics but returns no partial program on broken references', () => {
    expect(errors(profile([css('valid', '#identity')], [rule('missing'), rule('valid', { scopeRefs: ['missing-scope'] })])))
      .toEqual(['missing', 'valid'].map((ruleId) => ({ profileId: 'synthetic', ruleId, status: 'invalid-reference', level: 'error' })));
  });

  it('rejects missing/ambiguous localized messages and does not fall back to a different locale', () => {
    const heading = { '@id': locatorId('heading'), '@type': 'AccessibleLocator' as const, accessibleNameRef: locatorId('name') };
    const source = profile([...label('name', 'Account holder'), heading], [rule('heading')]);
    expect(errors({ ...source, localeRef: undefined })[0]?.status).toBe('invalid-message');
    expect(errors(profile([{ '@id': locatorId('name'), '@type': 'MessageMeta' }, heading], [rule('heading')]))[0]?.status).toBe('invalid-message');
    const duplicate = { '@id': locatorId('duplicate'), '@type': 'Message' as const,
      messageMetaRef: locatorId('name'), localeRef: locatorId('en'), value: 'Account holder' };
    expect(errors(profile([...label('name', 'Account holder'), duplicate, heading], [rule('heading')]))[0]?.status).toBe('invalid-message');
  });

  it.each([
    { origin: '*' }, { origin: 'https://example.test/path' }, { origin: 'https://*.example.test' },
    { origin: 'https://user:password@example.test' }, { origin: 'file://' },
    { path: { prefix: '' } }, { path: { prefix: '/account', exact: '/account' } },
    { path: { prefix: '/a/../account' } }, { path: { prefix: '/account?name=private' } },
  ])('rejects invalid page scopes: %j', (override) => {
    expect(errors({ ...dummyProfile, scopes: [{ ...dummyProfile.scopes[0], ...override }] })[0]?.status).toBe('invalid-scope');
  });

  it.each([
    { kind: 'container' }, { kind: 'leaf', childNodeIndex: 0 },
    { kind: 'direct-text', childNodeIndex: -1 }, { kind: 'direct-text', childNodeIndex: 0.5 },
  ])('rejects unsupported text destinations: %j', (text) => {
    expect(errors({ ...dummyProfile, rules: [{ ...dummyProfile.rules[0], text }] })[0]?.status).toBe('invalid-rule');
  });

  it('rejects duplicate identities and altered catalog contexts', () => {
    expect(errors({ ...dummyProfile, rules: [...dummyProfile.rules, ...dummyProfile.rules] })[0]?.status).toBe('invalid-rule');
    expect(errors({ ...dummyProfile, catalog: { ...dummyProfile.catalog, '@graph': [...dummyProfile.catalog['@graph'], ...dummyProfile.catalog['@graph']] } })[0]?.status).toBe('invalid-profile');
    expect(errors({ ...dummyProfile, catalog: { ...dummyProfile.catalog, '@context': [] } })[0]?.status).toBe('invalid-profile');
  });
});
