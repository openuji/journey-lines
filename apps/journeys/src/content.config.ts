import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';
import { z } from 'astro/zod';
import type { JourneyEntry } from '@journey-lines/journey';
import { ENTRY_FILE, readEntries, STORE } from './lib/journey-store';

/**
 * The store's published journeys as an Astro collection. While `astro dev` runs, a new or
 * changed entry re-reads the store, which is what lets Astro list it and
 * build its page without a restart.
 */
const journeyStore: Loader = {
  name: 'journey-store',
  load: async ({ config, store, logger, watcher }) => {
    const root = fileURLToPath(new URL(`${STORE.published}/`, config.root));
    const sync = () => {
      const entries = readEntries(root);
      store.clear();
      for (const entry of entries) store.set({ id: entry.id, data: entry });
    };
    sync();
    watcher?.on('all', (_event, path) => {
      if (!path.startsWith(root) || basename(path) !== ENTRY_FILE) return;
      try {
        sync();
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
      }
    });
  },
};

export const collections = {
  // `readEntries` checks each entry's version; the schema only names its type.
  journeys: defineCollection({ loader: journeyStore, schema: z.custom<JourneyEntry>() }),
};
