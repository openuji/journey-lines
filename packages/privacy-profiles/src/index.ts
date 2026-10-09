import type { PrivacyProfile } from '@openuji/privacy';

/** The demo uses an ephemeral loopback port and deliberately contains no target. */
export const dummyProfile = {
  id: 'demo',
  version: '1',
  scopes: [{ id: 'demo.pages', origin: 'http://127.0.0.1:*', path: { prefix: '/' } }],
  catalog: {
    '@context': [
      'https://ujg.specs.openuji.org/ed/ns/context.jsonld',
      'https://ujg.specs.openuji.org/ed/ns/surface.context.jsonld',
      'https://ujg.specs.openuji.org/ed/ns/l10n.context.jsonld',
      'https://ujg.specs.openuji.org/ed/ns/observability.context.jsonld',
    ],
    '@graph': [{
      '@id': 'urn:privacy:demo:missing-name',
      '@type': 'CustomLocator',
      //extensions: { 'org.openuji.privacy.css': { selector: '[data-uxr-privacy-demo="absent"]' } },
      extensions: { 'org.openuji.privacy.css': { selector: '#identity' } },
      
    }],
  },
  rules: [{
    id: 'demo.missing-name', scopeRefs: ['demo.pages'], locatorRef: 'urn:privacy:demo:missing-name',
    replacement: 'Don Joe', text: { kind: 'leaf' },
  }],
} as const satisfies PrivacyProfile;
