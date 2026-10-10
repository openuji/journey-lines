import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MilestoneCapture } from '@openuji/core';
import { compilePrivacy, createPrivacy, privacyProfileFromDocument } from '@openuji/privacy';

const defaultsUrl = new URL('../settings.defaults.json', import.meta.url);
const defaults = JSON.parse(readFileSync(defaultsUrl, 'utf8'));
const document = JSON.parse(readFileSync(new URL(defaults.privacy.profilePath, defaultsUrl), 'utf8'));
const identityUrl = 'https://identity.fu-berlin.de/idp-fub/profile/SAML2/Redirect/SSO';

describe('extension-owned FU privacy document', () => {
  it('keeps the remaining selectors inactive while the account header and username are configured', () => {
    const program = compilePrivacy(privacyProfileFromDocument(document));
    expect(program.rules).toHaveLength(13);
    const pending = program.rules.filter((rule) => !['fu.booking.account', 'fu.identity.username'].includes(rule.id));
    expect(pending).toHaveLength(11);
    expect(pending.every((rule) => rule.selector === ':not(*)')).toBe(true);
    expect(program.rules.filter((rule) => rule.action === 'mask-input')).toHaveLength(2);
  });

  it.each([
    ['https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/example.html', 'https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/donjoe.html'],
    ['https://service.fu-berlin.de/servity/home/12345', 'https://service.fu-berlin.de/servity/home/donjoe'],
    ['https://identity.fu-berlin.de/idp-fub/profile/SAML2/POST/SSO?execution=example', 'https://identity.fu-berlin.de/idp-fub/profile/SAML2/POST/SSO?execution=private'],
    ['https://raumbuchung.ub.fu-berlin.de/lernort/view_entry.php?id=12345', 'https://raumbuchung.ub.fu-berlin.de/lernort/view_entry.php?id=private'],
    ['https://my.fu-berlin.de/', 'https://my.fu-berlin.de/'],
    ['https://example.test/servity/home/12345', 'https://example.test/servity/home/12345'],
  ])('retains scoped metadata behavior for %s', (url, expected) => {
    expect(createPrivacy(privacyProfileFromDocument(document)).sanitizeLocation({ url }).url).toBe(expected);
  });

  it.each([
    [';__Host-JSESSIONID=synthetic-session?execution=synthetic-flow', ';__Host-JSESSIONID=private?execution=private'],
    [';jsessionid=synthetic-session?lang=de&execution=synthetic-flow#login', ';jsessionid=private?lang=de&execution=private#login'],
    ['?JSESSIONID=synthetic-session&execution=synthetic-flow&lang=de', '?JSESSIONID=private&execution=private&lang=de'],
    ['?execution=synthetic-flow&__Host-JSESSIONID=synthetic-session', '?execution=private&__Host-JSESSIONID=private'],
    [';JSESSIONID=synthetic-session;route=login?EXECUTION=synthetic-flow', ';JSESSIONID=private;route=login?EXECUTION=private'],
    [';__Host-JSESSIONID=synthetic-session?JSESSIONID=another-session&execution=synthetic-flow&execution=another-flow',
      ';__Host-JSESSIONID=private?JSESSIONID=private&execution=private&execution=private'],
    ['?otherJSESSIONID=public&executionMode=public', '?otherJSESSIONID=public&executionMode=public'],
  ])('redacts SSO tokens while preserving URL structure: %s', (suffix, expectedSuffix) => {
    const privacy = createPrivacy(privacyProfileFromDocument(document));
    const location = { url: identityUrl + suffix, title: `Login at "${identityUrl + suffix}" — continue` };
    const expected = { url: identityUrl + expectedSuffix, title: `Login at "${identityUrl + expectedSuffix}" — continue` };
    expect(privacy.sanitizeLocation(location)).toEqual(expected);
    expect(privacy.sanitizeLocation(expected)).toEqual(expected);
    expect(location.url).toBe(identityUrl + suffix);
  });

  it.each([
    'https://identity.fu-berlin.de/idp-fub/profile/SAML2/Redirect/SSO',
    'https://my.fu-berlin.de/',
    'https://raumbuchung.ub.fu-berlin.de/index.php',
    'https://raumbuchung.ub.fu-berlin.de/lernort/view_entry.php',
    'https://veranstaltung.weiterbildung.fu-berlin.de/Kontakt/example.html',
    'https://service.fu-berlin.de/servity/home/12345',
  ])('redacts SSO links and event metadata in captures and clips from %s', (pageUrl) => {
    const privacy = createPrivacy(privacyProfileFromDocument(document));
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
    const before = JSON.stringify(capture);
    const captures = { name: 'captures', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    const clips = { name: 'clips', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    privacy.wrapCaptureSink(captures).enqueue(capture);
    privacy.wrapClipSink(clips).enqueue({ type: 'keep', id: 'clip-1', capture });
    const output = captures.enqueue.mock.calls[0]![0] as MilestoneCapture;
    expect(JSON.stringify(output)).not.toMatch(/synthetic-session|synthetic-flow/);
    expect(output.detail).toBe(`Navigate to "${safeUrl}" then continue`);
    expect(output.domTarget).toEqual({ ...capture.domTarget,
      selector: `a[href="${safeUrl}"]`, id: 'JSESSIONID=private', name: 'execution=private',
      className: 'login JSESSIONID=private next', ariaLabel: `Open ${safeUrl} now`,
      textSnippet: `Continue at ${safeUrl} now`, href: safeUrl });
    expect(output.scrollEpisode?.cause.detail).toBe(safeUrl);
    expect(output.frame).toBe(capture.frame);
    expect(clips.enqueue.mock.calls[0]![0]).toEqual({ type: 'keep', id: 'clip-1', capture: output });
    expect(JSON.stringify(capture)).toBe(before);
  });

  it('leaves URLs outside the configured FU scopes unchanged', () => {
    const privacy = createPrivacy(privacyProfileFromDocument(document));
    for (const url of [
      'https://example.test/SSO;JSESSIONID=synthetic-session?execution=synthetic-flow',
      'https://identity.fu-berlin.de/idp-fub-other/SSO;JSESSIONID=synthetic-session?execution=synthetic-flow',
    ]) expect(privacy.sanitizeLocation({ url })).toEqual({ url });
  });
});
