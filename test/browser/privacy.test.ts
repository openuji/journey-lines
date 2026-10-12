import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { launchPuppeteerTarget, type PuppeteerTarget } from '@openuji/host-puppeteer';
import { attachPrivacy, compilePrivacy, type PrivacyAttachment, type PrivacyDiagnostic, type PrivacyProgram } from '@openuji/privacy';
import { loadPrivacyDemoProfile, startPrivacyDemo } from '../../apps/stream-cli/src/privacy-demo.js';
import { PRIVACY_SOURCE } from '../../packages/privacy/src/generated/privacy-source.js';
import { PRIVACY_INSTALL, PRIVACY_STATE } from '../../packages/privacy/src/constants.js';
import { css, label, locatorId, profile, rule } from '../../packages/privacy/test/fixtures.js';

const WAIT = { timeout: 5_000, interval: 25 };
const dummyProfile = loadPrivacyDemoProfile();
const DUMMY_PRIVACY_PROGRAM = compilePrivacy(dummyProfile);
const nameProgram: PrivacyProgram = {
  id: 'fixture.name.v1', rules: [{ id: 'name', selector: '#identity', replacement: 'Don Joe' }],
};
let target: PuppeteerTarget;
let demo: Awaited<ReturnType<typeof startPrivacyDemo>>;
let attachments: PrivacyAttachment[];

beforeEach(async () => {
  attachments = [];
  demo = await startPrivacyDemo();
  target = await launchPuppeteerTarget({
    headless: process.env['UXR_HEADLESS'] === '1' || process.env['UXR_HEADLESS'] === 'true',
    executablePath: process.env['UXR_CHROME_EXECUTABLE'],
  });
});
afterEach(async () => {
  for (const attachment of attachments) await attachment.dispose();
  await target?.close();
  await demo?.close();
});
async function attach(program = DUMMY_PRIVACY_PROGRAM, report: (diagnostic: PrivacyDiagnostic) => void = () => {}) {
  const attachment = await attachPrivacy(target.cdp, program, report);
  attachments.push(attachment);
  return attachment;
}
const identity = () => target.page.$eval('#identity', (element) => element.textContent);
const completions = (diagnostics: PrivacyDiagnostic[]) => diagnostics.filter((d) => d.type === 'completed');

describe('standalone privacy injection', () => {
  it('runs the currently selected bundled demo on an already loaded document', async () => {
    await target.navigate(demo.url, { waitUntil: 'domcontentloaded' });
    const before = await target.page.content();
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(DUMMY_PRIVACY_PROGRAM, (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 1, overwritten: 1 });
    expect(diagnostics.map((d) => d.type)).toEqual(['installed', 'rule', 'completed']);
    expect(diagnostics[1]).toMatchObject({ ruleId: 'demo.missing-name', status: 'overwritten', matched: 1, overwritten: 1 });
    expect(diagnostics.every((d) => d.profileId === dummyProfile.id)).toBe(true);
    expect(await target.page.content()).toBe(before.replace('Example Participant', 'Don Joe'));
  });

  it('retains the Stage 1 zero-match behavior with an absent selector', async () => {
    await target.navigate(demo.url, { waitUntil: 'domcontentloaded' });
    const before = await target.page.content();
    const diagnostics: PrivacyDiagnostic[] = [];
    const program = compilePrivacy(profile([css('absent', '[data-uxr-privacy-demo="absent"]')], [rule('absent')]));
    const attachment = await attach(program, (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 0, overwritten: 0 });
    expect(diagnostics[1]).toMatchObject({ status: 'unmatched', level: 'warning' });
    expect(await target.page.content()).toBe(before);
  });

  it('injects subsequent documents and runs after the parser has created their targets', async () => {
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(nameProgram, (d) => diagnostics.push(d));
    await attachment.ready; // initial about:blank
    diagnostics.length = 0;
    for (const url of [demo.url, `${demo.url}second`]) {
      await target.navigate(url, { waitUntil: 'domcontentloaded' });
      await vi.waitFor(async () => expect(await identity()).toBe('Don Joe'), WAIT);
    }
    await vi.waitFor(() => expect(completions(diagnostics)).toHaveLength(2), WAIT);
    expect(completions(diagnostics).every((d) => d.overwritten === 1)).toBe(true);
  });

  it('does not repeat the pass after duplicate injection or later DOM changes', async () => {
    await target.navigate(demo.url, { waitUntil: 'domcontentloaded' });
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(nameProgram, (d) => diagnostics.push(d));
    await attachment.ready;
    expect(await identity()).toBe('Don Joe');
    await target.page.$eval('#identity', (element) => { element.textContent = 'Later synthetic update'; });
    await target.cdp.send('Runtime.evaluate', {
      expression: `${PRIVACY_SOURCE}\n;globalThis.${PRIVACY_INSTALL}(${JSON.stringify(nameProgram)})`,
    });
    expect(await identity()).toBe('Later synthetic update');
    expect(completions(diagnostics)).toHaveLength(1);
  });

  it('leaves replacements on disposal, supports completed reattachment, and stops future injection', async () => {
    await target.navigate(demo.url, { waitUntil: 'domcontentloaded' });
    const first = await attach(nameProgram);
    await first.ready;
    await first.dispose();
    expect(await identity()).toBe('Don Joe');
    const report = vi.fn();
    const second = await attach(nameProgram, report);
    await expect(second.ready).resolves.toEqual({ status: 'completed', matched: 1, overwritten: 1 });
    expect(report).not.toHaveBeenCalled();
    await second.dispose();
    await target.navigate(`${demo.url}second`, { waitUntil: 'domcontentloaded' });
    expect(await identity()).toBe('Example Participant');
    const marker = await target.cdp.send('Runtime.evaluate', { expression: `typeof globalThis.${PRIVACY_STATE}`, returnByValue: true });
    expect(marker.result.value).toBe('undefined');
  });

  it('does not destroy nested controls or change editable values', async () => {
    await target.page.setContent('<div id="container">Example <button>Keep me</button></div><input id="credential" value="synthetic-login"><div contenteditable id="editor">Synthetic editor</div>');
    const program = {
      id: 'fixture.controls.v1',
      rules: ['container', 'credential', 'editor'].map((id) => ({ id, selector: `#${id}`, replacement: 'Don Joe' })),
    };
    const before = await target.page.content();
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(program, (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 3, overwritten: 0 });
    expect(await target.page.content()).toBe(before);
    expect(diagnostics.filter((d) => d.type === 'rule').every((d) => d.status === 'unsupported-target')).toBe(true);
  });

  it('skips ambiguous and invalid selectors without interrupting a valid write', async () => {
    await target.page.setContent('<p>One</p><p>Two</p><span id="identity">Example Participant</span>');
    const attachment = await attach({
      id: 'fixture.selectors.v1', rules: [
        { id: 'ambiguous', selector: 'p', replacement: 'Don Joe' },
        { id: 'invalid', selector: '[', replacement: 'Don Joe' },
        ...nameProgram.rules,
      ],
    });
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 3, overwritten: 1 });
    expect(await target.page.$$eval('p', (elements) => elements.map((el) => el.textContent))).toEqual(['One', 'Two']);
    expect(await identity()).toBe('Don Joe');
  });

  it('cancels pending DOM readiness on disposal without writing or restoring anything', async () => {
    let release!: () => void;
    let requested!: () => void;
    const scriptRequested = new Promise<void>((resolve) => { requested = resolve; });
    const held = new Set<ServerResponse>();
    const server = createServer((request, response) => {
      if (request.url === '/hold.js') {
        held.add(response);
        release = () => { response.writeHead(200, { 'content-type': 'text/javascript' }); response.end(''); held.delete(response); };
        requested();
      } else {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><p id="identity">Example Participant</p><script src="/hold.js"></script>');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await target.navigate(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      await scriptRequested;
      const diagnostics: PrivacyDiagnostic[] = [];
      const attachment = await attach(nameProgram, (d) => diagnostics.push(d));
      expect(await target.page.evaluate(() => document.readyState)).toBe('loading');
      await attachment.dispose();
      await expect(attachment.ready).resolves.toEqual({ status: 'cancelled', reason: 'disposed' });
      release();
      await target.page.waitForFunction(() => document.readyState !== 'loading');
      expect(await identity()).toBe('Example Participant');
      expect(completions(diagnostics)).toHaveLength(0);
    } finally {
      for (const response of held) response.end();
      await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
    }
  });
});

describe('compiled privacy profiles', () => {
  async function fixture(html: string) {
    await target.navigate(demo.url, { waitUntil: 'domcontentloaded' });
    await target.page.setContent(html);
  }

  it('masks credentials without reading their values, types or names being changed', async () => {
    await fixture('<input id="user" name="username" type="text" value="synthetic-user"><input id="password" name="password" type="password" value="synthetic-secret">');
    await target.page.evaluate(() => {
      for (const element of Array.from(document.querySelectorAll('input'))) Object.defineProperty(element, 'value', {
        configurable: true, get() { throw new Error('Credential value was read'); },
      });
    });
    const program = compilePrivacy(profile([css('user', '#user'), css('password', '#password')],
      ['user', 'password'].map((id) => ({ id, locatorRef: locatorId(id), scopeRefs: ['page'], action: 'mask-input' }))));
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(program, (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 2, overwritten: 2 });
    expect(diagnostics.filter((d) => d.type === 'rule').every((d) => d.status === 'masked')).toBe(true);
    expect(await target.page.evaluate(() => Array.from(document.querySelectorAll('input'), (el) => {
      Reflect.deleteProperty(el, 'value');
      return [el.type, el.name, el.value, getComputedStyle(el).getPropertyValue('-webkit-text-security')];
    }))).toEqual([['text', 'username', 'synthetic-user', 'disc'], ['password', 'password', 'synthetic-secret', 'disc']]);
  });

  it('installs and disposes every accessible existing document context', async () => {
    await fixture('<p id="identity">Top identity</p><iframe srcdoc="<p id=identity>Child identity</p>"></iframe>');
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attachPrivacy(target.cdp, nameProgram, (d) => diagnostics.push(d), { allFrames: true });
    attachments.push(attachment);
    await attachment.ready;
    expect(await identity()).toBe('Don Joe');
    expect(await target.page.evaluate(() => document.querySelector('iframe')!.contentDocument!.querySelector('#identity')!.textContent)).toBe('Don Joe');
    expect(completions(diagnostics)).toHaveLength(2);
    await attachment.dispose();
    expect(await target.page.evaluate(() => typeof (document.querySelector('iframe')!.contentWindow as unknown as Record<string, unknown>).__uxr_privacy_dispose__)).toBe('undefined');
  });

  it('resolves accessible roles, names, descriptions, and all ancestor contexts', async () => {
    await fixture(`<section aria-label="Account"><div role="group" aria-label="Details">
      <h2 id="identity" aria-label="Account holder" aria-describedby="hint">Synthetic Person</h2>
      <h2 id="different-description" aria-label="Account holder">Other display</h2>
      <h2 hidden aria-label="Account holder" aria-describedby="hint">Hidden display</h2>
      <div aria-hidden="true"><h2 aria-label="Account holder" aria-describedby="hint">Also hidden</h2></div>
      </div><h2 id="no-group" aria-label="Account holder" aria-describedby="hint">Outside group</h2></section>
      <div role="group" aria-label="Details"><h2 id="outside" aria-label="Account holder" aria-describedby="hint">Outside account</h2></div>
      <p id="hint">Public display name</p>`);
    const source = profile([
      ...label('name', 'Account holder'), ...label('description', 'Public display name'), ...label('account', 'Account'),
      { '@id': locatorId('region'), '@type': 'AccessibleLocator', role: 'region', accessibleNameRef: locatorId('account') },
      { '@id': locatorId('group'), '@type': 'AccessibleLocator', role: 'group' },
      { '@id': locatorId('heading'), '@type': 'AccessibleLocator', role: 'heading',
        accessibleNameRef: locatorId('name'), accessibleDescriptionRef: locatorId('description'),
        contextLocatorRefs: [locatorId('region'), locatorId('group')] },
    ], [rule('heading')]);
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(compilePrivacy(source), (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 1, overwritten: 1 });
    expect(await identity()).toBe('Don Joe');
    expect(await target.page.$eval('#different-description', (el) => el.textContent)).toBe('Other display');
    expect(await target.page.$eval('#no-group', (el) => el.textContent)).toBe('Outside group');
    expect(await target.page.$eval('#outside', (el) => el.textContent)).toBe('Outside account');
    expect(diagnostics[1]).toMatchObject({ profileId: 'synthetic', ruleId: 'heading', status: 'overwritten', level: 'info' });
    const state = await target.page.evaluate((key) => JSON.stringify((window as unknown as Record<string, unknown>)[key]), PRIVACY_STATE);
    expect(state).not.toContain('Synthetic Person');
    expect(JSON.stringify(diagnostics)).not.toMatch(/Synthetic Person|Account holder|Public display name/);
  });

  it('resolves every accessible lookup before a preceding rule changes its label or description', async () => {
    await fixture('<span id="label">Account action</span><span id="hint">Public action</span><button id="action" aria-labelledby="label" aria-describedby="hint">Synthetic Person</button>');
    const source = profile([
      css('label', '#label'), css('hint', '#hint'), ...label('name', 'Account action'), ...label('description', 'Public action'),
      { '@id': locatorId('button'), '@type': 'AccessibleLocator', role: 'button',
        accessibleNameRef: locatorId('name'), accessibleDescriptionRef: locatorId('description') },
    ], [rule('label'), rule('hint'), rule('button', { replacement: 'DJ' })]);
    const attachment = await attach(compilePrivacy(source));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 3, overwritten: 3 });
    expect(await target.page.$eval('#action', (el) => el.textContent)).toBe('DJ');
  });

  it('writes only the declared direct text node while preserving nested controls and listeners', async () => {
    await fixture('<div id="owner">Synthetic Person<button id="keep">Keep me</button><input id="credential" value="synthetic-login"><span>Keep suffix</span></div>');
    await target.page.evaluate(() => {
      document.querySelector('#keep')!.addEventListener('click', () => document.querySelector('#keep')!.setAttribute('data-clicked', 'yes'));
    });
    const source = profile([css('owner', '#owner')], [rule('owner', { text: { kind: 'direct-text', childNodeIndex: 0 } })]);
    const attachment = await attach(compilePrivacy(source));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 1, overwritten: 1 });
    expect(await target.page.$eval('#owner', (el) => el.firstChild?.textContent)).toBe('Don Joe');
    expect(await target.page.$eval('#credential', (el) => (el as HTMLInputElement).value)).toBe('synthetic-login');
    expect(await target.page.$eval('#owner span', (el) => el.textContent)).toBe('Keep suffix');
    await target.page.click('#keep');
    expect(await target.page.$eval('#keep', (el) => el.getAttribute('data-clicked'))).toBe('yes');
  });

  it('skips unsafe leaf writes and invalid direct node indices without a container fallback', async () => {
    await fixture('<div id="owner">Synthetic Person<button>Keep me</button></div><div contenteditable id="editable">Editable text</div>');
    const source = profile([css('owner', '#owner'), css('editable', '#editable')], [
      rule('leaf', { locatorRef: locatorId('owner') }),
      rule('element-child', { locatorRef: locatorId('owner'), text: { kind: 'direct-text', childNodeIndex: 1 } }),
      rule('missing-child', { locatorRef: locatorId('owner'), text: { kind: 'direct-text', childNodeIndex: 9 } }),
      rule('editable', { text: { kind: 'direct-text', childNodeIndex: 0 } }),
    ]);
    const before = await target.page.content();
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(compilePrivacy(source), (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 4, overwritten: 0 });
    expect(await target.page.content()).toBe(before);
    expect(diagnostics.filter((d) => d.type === 'rule').every((d) => d.status === 'unsupported-target' && d.level === 'warning')).toBe(true);
  });

  it('defaults to one match and permits multiple writes only when explicitly declared', async () => {
    await fixture('<p class="ambiguous">One</p><p class="ambiguous">Two</p><p class="multiple">Three</p><p class="multiple">Four</p><p class="unsafe">Five</p><div class="unsafe">Six<button>Keep me</button></div>');
    const source = profile([css('ambiguous', '.ambiguous'), css('multiple', '.multiple'), css('unsafe', '.unsafe'), css('missing', '#absent')], [
      rule('ambiguous'), rule('multiple', { allowMultiple: true }), rule('unsafe', { allowMultiple: true }), rule('missing'),
    ]);
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(compilePrivacy(source), (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 6, overwritten: 2 });
    expect(await target.page.$$eval('.multiple', (els) => els.map((el) => el.textContent))).toEqual(['Don Joe', 'Don Joe']);
    expect(await target.page.$$eval('.ambiguous', (els) => els.map((el) => el.textContent))).toEqual(['One', 'Two']);
    expect(await target.page.$eval('p.unsafe', (el) => el.textContent)).toBe('Five');
    expect(diagnostics.filter((d) => d.type === 'rule').map((d) => [d.status, d.level])).toEqual([
      ['ambiguous', 'warning'], ['overwritten', 'info'], ['unsupported-target', 'warning'], ['unmatched', 'warning'],
    ]);
  });

  it('applies exact origins and path segments once per document, ignoring queries and fragments', async () => {
    const origin = new URL(demo.url).origin;
    const source = {
      ...profile([css('name', '#identity')], [
        rule('name', { scopeRefs: ['account'] }),
        rule('second', { locatorRef: locatorId('name'), scopeRefs: ['second'], replacement: 'DJ' }),
        rule('other-origin', { locatorRef: locatorId('name'), scopeRefs: ['other-origin'], replacement: 'WRONG' }),
        rule('other-port', { locatorRef: locatorId('name'), scopeRefs: ['other-port'], replacement: 'WRONG' }),
      ]),
      scopes: [
        { id: 'account', origin, path: { prefix: '/account' } },
        { id: 'second', origin, path: { exact: '/second' } },
        { id: 'other-origin', origin: origin.replace('127.0.0.1', 'localhost'), path: { prefix: '/' } },
        { id: 'other-port', origin: 'http://127.0.0.1:1', path: { prefix: '/' } },
      ],
    };
    const diagnostics: PrivacyDiagnostic[] = [];
    await (await attach(compilePrivacy(source), (d) => diagnostics.push(d))).ready;
    for (const [path, expected, ruleId] of [
      ['account', 'Don Joe', 'name'], ['account/profile?next=/second#name', 'Don Joe', 'name'],
      ['accounting', 'Example Participant', undefined], ['second', 'DJ', 'second'],
      ['second/child', 'Example Participant', undefined],
    ] as const) {
      diagnostics.length = 0;
      await target.navigate(`${demo.url}${path}`, { waitUntil: 'domcontentloaded' });
      await vi.waitFor(() => expect(completions(diagnostics)).toHaveLength(1), WAIT);
      expect(await identity()).toBe(expected);
      expect(diagnostics.filter((d) => d.type === 'rule').map((d) => d.ruleId)).toEqual(ruleId ? [ruleId] : []);
    }
    await target.page.evaluate(() => history.replaceState(null, '', '/account'));
    expect(await identity()).toBe('Example Participant');
    expect(completions(diagnostics)).toHaveLength(1);
  });

  it('keeps invalid CSS as a warning without preventing another compiled rule from running', async () => {
    await fixture('<p id="identity">Synthetic Person</p>');
    const diagnostics: PrivacyDiagnostic[] = [];
    const attachment = await attach(compilePrivacy(profile([css('invalid', '['), css('name', '#identity')], [rule('invalid'), rule('name')])), (d) => diagnostics.push(d));
    await expect(attachment.ready).resolves.toEqual({ status: 'completed', matched: 1, overwritten: 1 });
    expect(diagnostics[1]).toMatchObject({ ruleId: 'invalid', status: 'invalid-selector', level: 'warning', matched: 0, overwritten: 0 });
    expect(await identity()).toBe('Don Joe');
  });
});
