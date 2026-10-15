/**
 * Where imported journeys live, in two halves:
 * - published, in the site's public files: per journey, its entry and the
 *   pictures and videos of the steps it shows. A journey's folder is also its
 *   address, and this is all a reader ever loads.
 * - archives, never served: each report archive exactly as downloaded, hidden
 *   steps included, to derive the published half from again.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  entryFiles,
  journeyEntry,
  JOURNEY_ENTRY_VERSION,
  readReportArtifacts,
  unzipStored,
  type ArchiveEntry,
  type JourneyEntry,
} from '@journey-lines/journey';

/** Relative to the app's root. */
export const STORE = { published: 'public/journeys', archives: 'archive' } as const;
/** Written last, and whole: once it is there, so is the journey. */
export const ENTRY_FILE = 'entry.json';

export type StoreRoots = Readonly<{ published: string; archives: string }>;

export function storeRoots(appRoot: string): StoreRoots {
  return { published: join(appRoot, STORE.published), archives: join(appRoot, STORE.archives) };
}

/** An id names a folder and a file, and it comes from someone's archive. */
function checkedId(id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new Error(`The report's id ${JSON.stringify(id)} can't name a folder.`);
  return id;
}

/** A journey's page, and its folder of files, under the site's base. */
export function journeyHref(base: string, id: string): string {
  return `${base.replace(/\/?$/, '/')}journeys/${id}/`;
}

/** Where a reader loads each file the entry shows. */
export function journeyMedia(base: string, entry: JourneyEntry): Readonly<Record<string, string>> {
  const href = journeyHref(base, entry.id);
  return Object.fromEntries(entryFiles(entry).map((file) => [file, `${href}${file}`]));
}

function archived(files: readonly ArchiveEntry[], name: string): Uint8Array {
  const file = files.find((entry) => entry.name === name);
  if (!file) throw new Error(`The entry shows ${name}, which the archive does not contain.`);
  return file.bytes;
}

/**
 * Reads the whole archive before writing anything, so a broken archive never
 * leaves a half-filed journey. The same recording filed again replaces its
 * published folder, so the media of steps hidden since then do not linger.
 */
export function addJourney(roots: StoreRoots, archive: Uint8Array): { entry: JourneyEntry; updated: boolean } {
  const files = unzipStored(archive);
  const entry = journeyEntry(readReportArtifacts(files));
  const id = checkedId(entry.id);
  const dir = join(roots.published, id);
  const updated = existsSync(dir);

  mkdirSync(roots.archives, { recursive: true });
  writeFileSync(join(roots.archives, `${id}.zip`), archive);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const name of entryFiles(entry)) writeFileSync(join(dir, name), archived(files, name));
  // A rename appears at once, so a watcher never reads half an entry.
  writeFileSync(join(dir, `${ENTRY_FILE}.tmp`), `${JSON.stringify(entry, null, 2)}\n`);
  renameSync(join(dir, `${ENTRY_FILE}.tmp`), join(dir, ENTRY_FILE));
  return { entry, updated };
}

/** The order journeys are listed in: newest first. */
export function newestFirst(a: JourneyEntry, b: JourneyEntry): number {
  return b.startedAtMs - a.startedAtMs;
}

/** Every published journey, newest first. */
export function readEntries(published: string): JourneyEntry[] {
  if (!existsSync(published)) return [];
  return readdirSync(published, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => readEntry(join(published, item.name, ENTRY_FILE)))
    .sort(newestFirst);
}

function readEntry(path: string): JourneyEntry {
  const entry = JSON.parse(readFileSync(path, 'utf8')) as JourneyEntry;
  if (entry.version !== JOURNEY_ENTRY_VERSION) {
    throw new Error(`${path} is entry version ${String(entry.version)}, not ${JOURNEY_ENTRY_VERSION}. Add its archive again.`);
  }
  return entry;
}
