import { privacyProfileFromDocument, type PrivacyProfile } from '@openuji/privacy';

export interface ExtensionSettings {
  readonly privacy: { readonly profilePath: string };
  /** `tags`: what the report editor offers with one click. */
  readonly report: { readonly tags: readonly string[] };
}
const STORAGE_KEY = 'settings';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Trimmed, without blanks or repeats, in the order given. */
export const cleanTags = (tags: readonly string[]): string[] =>
  [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag !== ''))];

export function parseSettings(value: unknown): ExtensionSettings {
  if (!object(value) || !object(value.privacy) || typeof value.privacy.profilePath !== 'string' ||
      !/^privacy\/(?:[a-z\d_-]+\/)*[a-z\d_.-]+\.jsonld$/i.test(value.privacy.profilePath)) {
    throw new Error('Choose a JSON-LD profile packaged in the extension’s privacy folder.');
  }
  if (!object(value.report) || !Array.isArray(value.report.tags) ||
      !value.report.tags.every((tag) => typeof tag === 'string')) {
    throw new Error('Report tags must be a list of texts.');
  }
  return {
    privacy: { profilePath: value.privacy.profilePath },
    report: { tags: cleanTags(value.report.tags as string[]) },
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
