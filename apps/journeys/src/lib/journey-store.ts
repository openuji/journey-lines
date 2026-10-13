/**
 * Where imported journeys live: one folder per journey, holding its report
 * archive exactly as downloaded and the entry derived from it. The folder sits
 * in the site's public files, so a journey's folder is also its address.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  journeyEntry,
  JOURNEY_ENTRY_VERSION,
  readReportArtifacts,
  unzipStored,
  type JourneyEntry,
} from '@openuji/journey';

/** Relative to the app's root. */
export const STORE_DIR = 'public/journeys';
export const ARCHIVE_FILE = 'report.zip';
/** Written last, and whole: once it is there, so is the journey. */
export const ENTRY_FILE = 'entry.json';

/** An id becomes a folder name, and it comes from someone's file. */
const SAFE_ID = /^[\w-]+$/;

export function journeyDir(root: string, id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`The report's id ${JSON.stringify(id)} can't name a folder.`);
  return join(root, id);
}

/** A journey's page, and its folder of files, under the site's base. */
export function journeyHref(base: string, id: string): string {
  return `${base.replace(/\/?$/, '/')}journeys/${id}/`;
}

/**
 * Reads the whole archive before writing anything, so a broken archive never
 * leaves a half-filed journey. The same recording filed again replaces itself.
 */
export function addJourney(root: string, archive: Uint8Array): { entry: JourneyEntry; updated: boolean } {
  const entry = journeyEntry(readReportArtifacts(unzipStored(archive)));
  const dir = journeyDir(root, entry.id);
  const updated = existsSync(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ARCHIVE_FILE), archive);
  // A rename appears at once, so a watcher never reads half an entry.
  writeFileSync(join(dir, `${ENTRY_FILE}.tmp`), `${JSON.stringify(entry, null, 2)}\n`);
  renameSync(join(dir, `${ENTRY_FILE}.tmp`), join(dir, ENTRY_FILE));
  return { entry, updated };
}

/** The order journeys are listed in: newest first. */
export function newestFirst(a: JourneyEntry, b: JourneyEntry): number {
  return b.startedAtMs - a.startedAtMs;
}

/** Every filed journey, newest first. */
export function readEntries(root: string): JourneyEntry[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => readEntry(join(root, item.name, ENTRY_FILE)))
    .sort(newestFirst);
}

function readEntry(path: string): JourneyEntry {
  const entry = JSON.parse(readFileSync(path, 'utf8')) as JourneyEntry;
  if (entry.version !== JOURNEY_ENTRY_VERSION) {
    throw new Error(`${path} is entry version ${String(entry.version)}, not ${JOURNEY_ENTRY_VERSION}. Add its ${ARCHIVE_FILE} again.`);
  }
  return entry;
}
