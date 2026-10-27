import { privacyProfileFromDocument, type PrivacyProfile } from '@journey-lines/privacy';
import type { ReportLanguage } from '@journey-lines/journey';
import { parseVideoScale } from './video-scale';
import { parseClickTiming, type ClickTiming } from '@journey-lines/rules-interaction';

export type ReportSettings = Readonly<{ language: ReportLanguage; tags: readonly string[] }>;
export const defaultExtensionLanguage: ReportLanguage = 'de';
export const defaultReportSettings: ReportSettings = Object.freeze({
  language: defaultExtensionLanguage,
  tags: Object.freeze([]),
});

export interface ExtensionSettings {
  readonly privacy: { readonly profilePath: string };
  /** `language` applies to the extension; `tags` are literal report suggestions. */
  readonly report: ReportSettings;
  readonly video: { readonly scale: number };
  readonly click: ClickTiming;
}
const STORAGE_KEY = 'settings';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Trimmed, without blanks or repeats, in the order given. */
export const cleanTags = (tags: readonly string[]): string[] =>
  [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ''))];

/** Report preferences recover independently from invalid privacy or tag data. */
function reportSettingsFrom(value: unknown): ReportSettings {
  const report = object(value) ? value : {};
  const tags = Array.isArray(report.tags) ? report.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  return Object.freeze({
    language: report.language === 'en' ? 'en' : defaultExtensionLanguage,
    tags: Object.freeze(cleanTags(tags)),
  });
}

export function parseSettings(value: unknown): ExtensionSettings {
  if (!object(value) || !object(value.privacy) || typeof value.privacy.profilePath !== 'string' ||
      !/^privacy\/(?:[a-z\d_-]+\/)*[a-z\d_.-]+\.jsonld$/i.test(value.privacy.profilePath)) {
    throw new Error('Choose a JSON-LD profile packaged in the extension’s privacy folder.');
  }
  if (!object(value.report) || !Array.isArray(value.report.tags) ||
      !value.report.tags.every((tag) => typeof tag === 'string')) {
    throw new Error('Report tags must be a list of texts.');
  }
  if (value.report.language !== undefined && value.report.language !== 'en' && value.report.language !== 'de') {
    throw new Error('Extension language must be German or English.');
  }
  if (value.video !== undefined && !object(value.video)) {
    throw new Error('Video settings must contain a scale.');
  }
  return {
    privacy: { profilePath: value.privacy.profilePath },
    report: reportSettingsFrom(value.report),
    video: { scale: parseVideoScale(value.video?.scale) },
    click: parseClickTiming(value.click),
  };
}

/** Packaged data only: no tenant imports and no remote profile fetching. */
export async function readPackagedJson(path: string): Promise<unknown> {
  let response: Response;
  try { response = await fetch(chrome.runtime.getURL(path)); }
  catch { throw new Error('The configured privacy profile could not be loaded.'); }
  if (!response.ok) throw new Error('The configured privacy profile could not be loaded.');
  try { return await response.json(); }
  catch { throw new Error('The configured privacy profile is not valid JSON.'); }
}

export async function loadDefaultSettings(): Promise<ExtensionSettings> {
  return parseSettings(await readPackagedJson('settings.defaults.json'));
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const defaults = await loadDefaultSettings();
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  return stored === undefined ? defaults : parseSettings(stored);
}

/** Reading a completed report does not require a usable recording configuration. */
export async function loadReportSettings(): Promise<ReportSettings> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
    const source: unknown = stored === undefined ? await readPackagedJson('settings.defaults.json') : stored;
    return reportSettingsFrom(object(source) ? source.report : undefined);
  } catch {
    return defaultReportSettings;
  }
}

/** The persisted key remains report.language for compatibility with saved settings. */
export async function loadExtensionLanguage(): Promise<ReportLanguage> {
  return (await loadReportSettings()).language;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const validated = parseSettings(settings);
  await loadPrivacyProfile(validated);
  await chrome.storage.local.set({ [STORAGE_KEY]: validated });
}

export async function restoreDefaultSettings(): Promise<ExtensionSettings> {
  const defaults = await loadDefaultSettings();
  await loadPrivacyProfile(defaults);
  await chrome.storage.local.remove(STORAGE_KEY);
  return defaults;
}

export async function loadPrivacyProfile(settings: ExtensionSettings): Promise<PrivacyProfile> {
  const { privacy } = parseSettings(settings);
  return privacyProfileFromDocument(await readPackagedJson(privacy.profilePath));
}
