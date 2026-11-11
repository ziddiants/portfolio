// Is a build older than the files it was built from? The e2e suite reads dist/, so a run on a
// stale build would test old pages while the fixture is built fresh (ENG-04 and ENG-09 lesson).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The newest { file, mtimeMs } under the given files and folders (node_modules and dot-folders skipped). */
export function newestFile(paths) {
  let best = { file: null, mtimeMs: 0 };
  const visit = (p) => {
    const s = statSync(p, { throwIfNoEntry: false });
    if (!s) return;
    if (s.isDirectory()) {
      for (const e of readdirSync(p)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        visit(join(p, e));
      }
    } else if (s.mtimeMs > best.mtimeMs) best = { file: p, mtimeMs: s.mtimeMs };
  };
  paths.forEach(visit);
  return best;
}

/** The source file that is newer than the built page, or null when the build is current. */
export function staleBecause(builtFile, sourcePaths) {
  const built = statSync(builtFile).mtimeMs;
  const newest = newestFile(sourcePaths);
  if (newest.file === null) throw new Error('fresh: found no source file to compare with');
  return newest.mtimeMs > built ? newest.file : null;
}
