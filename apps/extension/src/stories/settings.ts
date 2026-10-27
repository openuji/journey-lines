import defaults from '../../settings.defaults.json';
import { parseSettings, type ExtensionSettings } from '../lib/settings';
import type { SettingsStorage } from '../ui/Settings/Settings';

export const storySettings = parseSettings(defaults);

/** Isolated per preview; changing a story never writes Chrome storage. */
export function createStorySettings(initial: ExtensionSettings = storySettings): SettingsStorage {
  let saved = structuredClone(initial);
  return {
    load: async () => structuredClone(saved),
    save: async (settings) => { saved = parseSettings(settings); },
    restore: async () => {
      saved = structuredClone(storySettings);
      return structuredClone(saved);
    },
  };
}
