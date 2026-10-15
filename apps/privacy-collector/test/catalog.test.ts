import { describe, expect, it } from 'vitest';
import { privacyProfileFromDocument } from '@journey-lines/privacy';
import { buildProfileDocument, defaultScope, parseState, type CollectorState } from '../src/lib/catalog';

const state: CollectorState = {
  tenant: 'fu',
  slots: [
    {
      id: 'booking.account', selector: 'header.banner p.account', action: 'replace-text',
      replacement: 'Don Joe (donjoe)', text: { kind: 'leaf' }, matchCount: 1, tagName: 'p',
      scope: { origin: 'https://booking.example.test', mode: 'exact', path: '/index.php' },
    },
    {
      id: 'identity.username', selector: 'form[name="login"] #username', action: 'mask-input',
      matchCount: 1, tagName: 'input',
      scope: { origin: 'https://identity.example.test', mode: 'prefix', path: '/idp' },
    },
    {
      id: 'booking.label', selector: '.booking-label', action: 'replace-attribute', attribute: 'aria-label',
      replacement: 'Private booking', allowMultiple: true, matchCount: 2, tagName: 'a',
      scope: { origin: 'https://booking.example.test', mode: 'exact', path: '/index.php' },
    },
  ],
};

describe('privacy collector catalog', () => {
  it('exports a compiler-ready UJG document with deduplicated scopes and addressable locators', () => {
    const document = buildProfileDocument(state);
    const profile = privacyProfileFromDocument(document);
    expect(profile.id).toBe('fu');
    expect(profile.scopes).toHaveLength(2);
    expect(profile.rules).toHaveLength(3);
    expect(profile.catalog['@graph']).toHaveLength(3);
    expect(profile.rules.map((rule) => rule.id)).toEqual([
      'fu.booking.account', 'fu.identity.username', 'fu.booking.label',
    ]);
  });

  it('does not export captured text, input values, query strings, or page titles', () => {
    const json = JSON.stringify(buildProfileDocument(state));
    expect(json).not.toMatch(/fixture-person|secret-value|execution=|page title/i);
    expect(json).toContain('Don Joe (donjoe)');
  });

  it('uses a stable parent scope instead of persisting a path-bound session ID', () => {
    expect(defaultScope('/idp-fub/profile/SAML2/SSO;__Host-JSESSIONID=private')).toEqual({
      mode: 'prefix', path: '/idp-fub/profile/SAML2',
    });
    expect(defaultScope('/index.php')).toEqual({ mode: 'exact', path: '/index.php' });
  });

  it('fails closed for malformed saved state and empty exports', () => {
    expect(parseState({ tenant: 'FU!', slots: state.slots })).toEqual({ tenant: 'tenant', slots: [] });
    expect(() => buildProfileDocument({ tenant: 'fu', slots: [{ id: 'bad' }] })).toThrow('Collect at least one');
  });
});
