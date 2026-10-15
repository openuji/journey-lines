import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const imports = (source: string): string[] => Array.from(source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g), (match) => match[1]!);

describe('localisation dependency boundaries', () => {
  it('selects extension dictionaries only at the provider boundary', () => {
    const extension = fileURLToPath(new URL('../../../apps/extension/src/', import.meta.url));
    for (const file of readdirSync(extension, { recursive: true, withFileTypes: true })
      .filter((file) => file.isFile() && /\.tsx?$/.test(file.name))) {
      const path = join(file.parentPath, file.name);
      const source = readFileSync(path, 'utf8');
      if (imports(source).some((dependency) => /(?:^|\/)dictionaries$/.test(dependency))) {
        expect(relative(extension, path)).toBe('localisation/TranslationProvider.tsx');
      }
      expect(source).not.toMatch(/\buseTranslation\(\s*[^\s)]/);
    }
  });

  it('keeps dictionary infrastructure independent of components and domain packages', () => {
    const infrastructure = join(root, 'localisation');
    for (const file of ['translate.ts', 'TranslationProvider.tsx']) {
      for (const dependency of imports(readFileSync(join(infrastructure, file), 'utf8'))) {
        if (dependency === 'react') {
          expect(file).toBe('TranslationProvider.tsx');
        } else {
          expect(dependency.startsWith('./')).toBe(true);
          expect(relative(infrastructure, resolve(infrastructure, dependency)).startsWith('..')).toBe(false);
        }
      }
    }
  });

  it('removes component wording contracts and the composed report catalog', () => {
    const ui = join(root, 'ui');
    expect(existsSync(join(ui, 'report-text.ts'))).toBe(false);
    for (const file of readdirSync(ui, { recursive: true, withFileTypes: true })
      .filter((file) => file.isFile() && /\.tsx?$/.test(file.name) && !file.name.endsWith('.stories.tsx'))) {
      const source = readFileSync(join(file.parentPath, file.name), 'utf8');
      expect(source).not.toMatch(/export type \w+Text\s*=/);
      expect(source).not.toMatch(/\bdefault\w+Text\b|\btext\?:/);
    }
  });
});
