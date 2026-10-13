import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, loadPrivacyProfile, restoreDefaultSettings, saveSettings, parseSettings } from '../src/lib/settings';

const defaultsUrl = new URL('../settings.defaults.json', import.meta.url);
const defaults = JSON.parse(readFileSync(defaultsUrl, 'utf8'));
const document = JSON.parse(readFileSync(new URL(defaults.privacy.profilePath, defaultsUrl), 'utf8'));
const alternate = { privacy: { profilePath: 'privacy/alternate/profiles.jsonld' }, report: { tags: ['Alternate'] } };
let stored: Record<string, unknown>;
let assets: Record<string, unknown>;

beforeEach(() => {
  stored = { unrelated: 'keep' };
  assets = {
    'settings.defaults.json': defaults,
    [defaults.privacy.profilePath]: document,
    [alternate.privacy.profilePath]: {
      ...document, extensions: {
        'org.openuji.privacy': { ...document.extensions['org.openuji.privacy'], id: 'alternate' },
      },
    },
  };
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: {
      get: async (key: string) => ({ [key]: stored[key] }),
      set: async (value: Record<string, unknown>) => { Object.assign(stored, value); },
      remove: async (key: string) => { delete stored[key]; },
    } },
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const value = assets[url.replace('chrome-extension://test/', '')];
    return new Response(JSON.stringify(value ?? null), { status: value === undefined ? 404 : 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('extension settings', () => {
  it('loads packaged defaults until an override is saved, then reads the selected profile', async () => {
    expect(await loadSettings()).toEqual(defaults);
    await saveSettings(alternate);
    expect(await loadSettings()).toEqual(alternate);
    expect((await loadPrivacyProfile(await loadSettings())).id).toBe('alternate');
    expect(stored.unrelated).toBe('keep');
  });

  it('restores current defaults instead of persisting a stale copy', async () => {
    await saveSettings(alternate);
    await restoreDefaultSettings();
    expect(stored).toEqual({ unrelated: 'keep' });
    assets['settings.defaults.json'] = alternate;
    expect(await loadSettings()).toEqual(alternate);
  });

  it('rejects a missing or invalid document before changing saved settings', async () => {
    await expect(saveSettings({ ...defaults, privacy: { profilePath: 'privacy/missing.jsonld' } })).rejects.toThrow();
    assets[alternate.privacy.profilePath] = {};
    await expect(saveSettings(alternate)).rejects.toThrow();
    expect(stored).toEqual({ unrelated: 'keep' });
  });

  it('reports invalid saved settings instead of silently using a different profile', async () => {
    stored.settings = {};
    await expect(loadSettings()).rejects.toThrow();
  });

  it.each(['https://example.test/profile.jsonld', '../privacy/profile.jsonld', 'privacy/../other.jsonld', 'privacy/a.jsonld?x=1'])('rejects non-packaged paths: %s', (profilePath) => {
    expect(() => parseSettings({ ...defaults, privacy: { profilePath } })).toThrow();
  });

  it('keeps default tags trimmed and once each, and rejects anything but a list of texts', () => {
    expect(parseSettings({ ...defaults, report: { tags: [' A ', '', 'A', 'B'] } }).report.tags).toEqual(['A', 'B']);
    expect(() => parseSettings({ privacy: defaults.privacy })).toThrow();
    expect(() => parseSettings({ ...defaults, report: { tags: [1] } })).toThrow();
  });
});
