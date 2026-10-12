import { compilePrivacy, PrivacyCompileError } from './compile.js';
import type { PrivacyProfile } from './profile.js';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read a local UJG document without fetching contexts or resolving imports. */
export function privacyProfileFromDocument(document: unknown): PrivacyProfile {
  const invalid = () => new PrivacyCompileError([
    { profileId: 'unknown', status: 'invalid-profile', level: 'error' },
  ]);
  if (!object(document) || document['@type'] !== 'UJGDocument' ||
      typeof document['@id'] !== 'string' || !/^[a-z][a-z\d+.-]*:\S+$/i.test(document['@id']) ||
      !Object.keys(document).every((key) => ['@id', '@type', '@context', 'nodes', 'extensions'].includes(key)) ||
      !Array.isArray(document.nodes) || !object(document.extensions)) throw invalid();
  const settings = document.extensions['org.openuji.privacy'];
  if (!object(settings) || 'catalog' in settings) throw invalid();
  const profile = {
    ...settings,
    catalog: { '@context': document['@context'], '@graph': document.nodes },
  } as unknown as PrivacyProfile;
  // Reuse the compiler's strict profile, locator, reference and action validation.
  compilePrivacy(profile);
  return profile;
}
