import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, loadReportSettings, loadExtensionLanguage, loadPrivacyProfile, restoreDefaultSettings, saveSettings, parseSettings } from '../src/lib/settings';

const defaultsUrl = new URL('../settings.defaults.json', import.meta.url);
const defaults = JSON.parse(readFileSync(defaultsUrl, 'utf8'));
const document = JSON.parse(readFileSync(new URL(defaults.privacy.profilePath, defaultsUrl), 'utf8'));
const alternate = {
  privacy: { profilePath: 'privacy/alternate/profiles.jsonld' },
  report: { language: 'en' as const, tags: ['Alternate'] },
  video: { scale: 0.625 },
};
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
  it('uses full resolution by default and for older saved settings', async () => {
    expect((await loadSettings()).video.scale).toBe(1);
    stored.settings = { privacy: alternate.privacy, report: alternate.report };
    expect(await loadSettings()).toEqual({ ...alternate, video: { scale: 1 } });
    expect(parseSettings({ ...defaults, video: {} }).video.scale).toBe(1);
  });

  it.each([0.1, 0.5, 0.625, 1])('persists video scale %s and restores full resolution', async (scale) => {
    await saveSettings({ ...alternate, video: { scale } });
    expect((await loadSettings()).video.scale).toBe(scale);
    expect((await restoreDefaultSettings()).video.scale).toBe(1);
    expect((await loadSettings()).video.scale).toBe(1);
  });

  it.each([0, -1, 0.099, 1.001, NaN, Infinity, -Infinity, '0.5', null])(
    'rejects invalid video scale %s without overwriting saved settings', async (scale) => {
      await saveSettings(alternate);
      await expect(saveSettings({ ...defaults, video: { scale } })).rejects.toThrow('Video scale');
      expect(await loadSettings()).toEqual(alternate);
    },
  );

  it.each([null, [], 0.5, '0.5'])('rejects malformed video settings: %j', (video) => {
    expect(() => parseSettings({ ...defaults, video })).toThrow('Video settings');
  });

  it.each([
    [{ privacy: null, report: { language: 'en', tags: null } }, 'en'],
    [{ privacy: null, report: { language: 'de', tags: [1] } }, 'de'],
    [{ report: { tags: ['Legacy'] } }, 'de'],
    [{ report: { language: 'fr' } }, 'de'],
    [null, 'de'],
  ])('reads the extension language independently from recording configuration: %j', async (settings, language) => {
    stored.settings = settings;
    delete assets['settings.defaults.json'];
    expect(await loadExtensionLanguage()).toBe(language);
  });

  it('uses packaged language defaults and recovers when preference storage is unavailable', async () => {
    assets['settings.defaults.json'] = { privacy: null, report: { language: 'en' } };
    expect(await loadExtensionLanguage()).toBe('en');
    vi.stubGlobal('chrome', { storage: { local: { get: async () => { throw new Error('Unavailable'); } } } });
    expect(await loadExtensionLanguage()).toBe('de');
  });

  it('loads packaged report defaults independently of privacy configuration', async () => {
    assets['settings.defaults.json'] = { privacy: null, report: defaults.report };
    expect(await loadReportSettings()).toEqual(defaults.report);
  });

  it('preserves the saved report language when privacy, tags, or packaged defaults are unavailable', async () => {
    stored.settings = { privacy: null, report: { language: 'en', tags: [' A ', 1, 'A'] } };
    delete assets['settings.defaults.json'];
    expect(await loadReportSettings()).toEqual({ language: 'en', tags: ['A'] });
    stored.settings = { privacy: null, report: { language: 'en', tags: null } };
    expect(await loadReportSettings()).toEqual({ language: 'en', tags: [] });
  });

  it('recovers report preferences from legacy, invalid, and unavailable settings', async () => {
    stored.settings = { report: { tags: ['Legacy'] } };
    expect(await loadReportSettings()).toEqual({ language: 'de', tags: ['Legacy'] });
    stored.settings = { report: { language: 'fr', tags: ['Valid tag'] } };
    expect(await loadReportSettings()).toEqual({ language: 'de', tags: ['Valid tag'] });
    delete stored.settings;
    delete assets['settings.defaults.json'];
    expect(await loadReportSettings()).toEqual({ language: 'de', tags: [] });
    vi.stubGlobal('chrome', { storage: { local: { get: async () => { throw new Error('Unavailable'); } } } });
    expect(await loadReportSettings()).toEqual({ language: 'de', tags: [] });
  });

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

  it('uses German for older saved settings without a language', async () => {
    stored.settings = { privacy: defaults.privacy, report: { tags: ['Legacy'] } };
    expect((await loadSettings()).report).toEqual({ language: 'de', tags: ['Legacy'] });
    expect(() => parseSettings({ ...defaults, report: { ...defaults.report, language: 'fr' } })).toThrow('language');
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
