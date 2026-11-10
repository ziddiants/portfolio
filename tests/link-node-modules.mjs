// Test helper (ENG-10): gives a temp copy of the repo its own node_modules folder that links each
// package of the real one. Astro keeps its content data store in node_modules/.astro; linking the
// whole folder would make every test copy write into the real store. Cache folders are skipped.
import { mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const CACHES = new Set(['.astro', '.vite']);

export function linkNodeModules(dir, repo = REPO) {
  mkdirSync(join(dir, 'node_modules'));
  for (const e of readdirSync(join(repo, 'node_modules'))) {
    if (!CACHES.has(e)) symlinkSync(join(repo, 'node_modules', e), join(dir, 'node_modules', e));
  }
}
