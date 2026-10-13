import type { MilestoneCapture } from '@openuji/core';

// Historical examples are policy data; the test runner only checks public outputs.
const locationFixtures = [
  ['https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/example.html',
    'https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/donjoe.html'],
  ['https://service.fu-berlin.de/servity/home/12345',
    'https://service.fu-berlin.de/servity/home/donjoe'],
  ['https://identity.fu-berlin.de/idp-fub/profile/SAML2/POST/SSO?execution=example',
    'https://identity.fu-berlin.de/idp-fub/profile/SAML2/POST/SSO?execution=private'],
  ['https://raumbuchung.ub.fu-berlin.de/lernort/view_entry.php?id=12345',
    'https://raumbuchung.ub.fu-berlin.de/lernort/view_entry.php?id=private'],
  ['https://my.fu-berlin.de/', 'https://my.fu-berlin.de/'],
  ['https://example.test/servity/home/12345', 'https://example.test/servity/home/12345'],
] as const;

const sessionFixtures = [
  [';__Host-JSESSIONID=synthetic-session?execution=synthetic-flow',
    ';__Host-JSESSIONID=private?execution=private'],
  [';jsessionid=synthetic-session?lang=de&execution=synthetic-flow#login',
    ';jsessionid=private?lang=de&execution=private#login'],
  ['?JSESSIONID=synthetic-session&execution=synthetic-flow&lang=de',
    '?JSESSIONID=private&execution=private&lang=de'],
  ['?execution=synthetic-flow&__Host-JSESSIONID=synthetic-session',
    '?execution=private&__Host-JSESSIONID=private'],
  [';JSESSIONID=synthetic-session;route=login?EXECUTION=synthetic-flow',
    ';JSESSIONID=private;route=login?EXECUTION=private'],
  [';__Host-JSESSIONID=synthetic-session?JSESSIONID=another-session&execution=synthetic-flow&execution=another-flow',
    ';__Host-JSESSIONID=private?JSESSIONID=private&execution=private&execution=private'],
  ['?otherJSESSIONID=public&executionMode=public', '?otherJSESSIONID=public&executionMode=public'],
] as const;

const pageScopeFixtures = [
  'https://identity.fu-berlin.de/idp-fub/profile/SAML2/Redirect/SSO',
  'https://my.fu-berlin.de/',
  'https://raumbuchung.ub.fu-berlin.de/index.php',
  'https://raumbuchung.ub.fu-berlin.de/lernort/view_entry.php',
  'https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/example.html',
  'https://service.fu-berlin.de/servity/home/12345',
] as const;

const identityUrl = 'https://identity.fu-berlin.de/idp-fub/profile/SAML2/Redirect/SSO';
export const locationCases = [
  ...locationFixtures.map(([url, expectedUrl]) => ({
    input: { url, title: 'Account title' }, expected: { url: expectedUrl, title: 'Account title' },
  })),
  ...sessionFixtures.map(([suffix, expectedSuffix]) => ({
    input: { url: identityUrl + suffix, title: `Login at "${identityUrl + suffix}" — continue` },
    expected: { url: identityUrl + expectedSuffix, title: `Login at "${identityUrl + expectedSuffix}" — continue` },
  })),
  ...[
    'https://example.test/SSO;JSESSIONID=synthetic-session?execution=synthetic-flow',
    'https://identity.fu-berlin.de/idp-fub-other/SSO;JSESSIONID=synthetic-session?execution=synthetic-flow',
  ].map((url) => ({ input: { url, title: '' }, expected: { url, title: '' } })),
];

export const captureCases = pageScopeFixtures.map((pageUrl) => {
  const loginUrl = `${identityUrl};__Host-JSESSIONID=synthetic-session?execution=synthetic-flow`;
  const safeUrl = `${identityUrl};__Host-JSESSIONID=private?execution=private`;
  const capture: MilestoneCapture = {
    viewId: 1, entry: 'load', documentId: 1, loaderId: 'chrome-loader', label: '10-pre-click-01',
    url: pageUrl, detail: `Navigate to "${loginUrl}" then continue`,
    frame: { index: 1, base64: 'unchanged pixels', scrollX: 0, scrollY: 0, viewportWidth: 600,
      viewportHeight: 400, pageScaleFactor: 1, receivedAtMs: 100, drawnAtMs: 95 },
    domTarget: { tagName: 'a', selector: `a[href="${loginUrl}"]`,
      id: 'JSESSIONID=synthetic-session', name: 'execution=synthetic-flow',
      className: 'login JSESSIONID=synthetic-session next', ariaLabel: `Open ${loginUrl} now`,
      textSnippet: `Continue at ${loginUrl} now`, href: loginUrl,
      boundingRect: { x: 0, y: 0, width: 1, height: 1 } },
    scrollEpisode: { cause: { kind: 'link', detail: loginUrl }, path: [] },
  };
  const expected: MilestoneCapture = {
    ...capture,
    url: locationFixtures.find(([url]) => url === pageUrl)?.[1] ?? pageUrl,
    detail: `Navigate to "${safeUrl}" then continue`,
    domTarget: { ...capture.domTarget!,
      selector: `a[href="${safeUrl}"]`, id: 'JSESSIONID=private', name: 'execution=private',
      className: 'login JSESSIONID=private next', ariaLabel: `Open ${safeUrl} now`,
      textSnippet: `Continue at ${safeUrl} now`, href: safeUrl },
    scrollEpisode: { cause: { kind: 'link', detail: safeUrl }, path: [] },
  };
  return { input: capture, expected, privateValues: ['synthetic-session', 'synthetic-flow'] };
});
