/**
 * Files a report archive downloaded from the extension as a journey:
 *
 *   pnpm journeys:add <report.zip>
 *
 * Runs as TypeScript through Node's own type stripping.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addJourney, journeyHref, storeRoots } from '../lib/journey-store.ts';

const appRoot = fileURLToPath(new URL('../../', import.meta.url));
const [file] = process.argv.slice(2);

if (!file) {
  console.error('Usage: pnpm journeys:add <report.zip>');
  process.exit(1);
}

try {
  const { entry, updated } = addJourney(storeRoots(appRoot), readFileSync(resolve(file)));
  console.log(`${updated ? 'Updated' : 'Added'} “${entry.title}” → ${journeyHref('/', entry.id)}`);
} catch (error) {
  console.error(`Could not add ${file}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
