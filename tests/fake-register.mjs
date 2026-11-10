// A fake private source register for tests that run a full build (VF-05, ENG-10). Source IDs are
// public, so the fake lists every ID that src/content/ cites and nothing else: the real register
// (private) is never copied.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Every S-### ID that a file under src/content/ names, sorted. */
export function citedSourceIds(root = REPO) {
  const ids = new Set();
  for (const f of filesUnder(join(root, 'src', 'content'))) {
    for (const [id] of readFileSync(f, 'utf8').matchAll(/\bS-\d{3}\b/g)) ids.add(id);
  }
  return [...ids].sort();
}

/** Writes <dir>/content-sources.md with one table row per cited ID. */
export function writeFakeRegister(dir, root = REPO) {
  const rows = citedSourceIds(root).map((id) => `| ${id} | test |`);
  writeFileSync(
    join(dir, 'content-sources.md'),
    ['| ID | Source |', '| --- | --- |', ...rows, ''].join('\n'),
  );
}
