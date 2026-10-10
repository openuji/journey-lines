import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createPrivacy, privacyProfileFromDocument } from '@openuji/privacy';

/** Tenant selection is data; an explicit CLI/programmatic path overrides defaults. */
export function loadRecordingPrivacy(profilePath?: string): ReturnType<typeof createPrivacy> {
  let path: string;
  if (profilePath !== undefined) path = resolve(profilePath);
  else {
    const defaultsUrl = new URL('../../extension/settings.defaults.json', import.meta.url);
    const defaults: unknown = JSON.parse(readFileSync(defaultsUrl, 'utf8'));
    const privacy = (defaults as { privacy?: { profilePath?: unknown } })?.privacy;
    if (typeof privacy?.profilePath !== 'string') throw new Error('Privacy defaults must specify a profile path.');
    path = fileURLToPath(new URL(privacy.profilePath, defaultsUrl));
  }
  return createPrivacy(privacyProfileFromDocument(JSON.parse(readFileSync(path, 'utf8'))));
}
