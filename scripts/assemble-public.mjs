// Builds .build/public-<id>/ for one version: the shared public/ folder, that version's
// résumé (always served as Aditya-Gupta-Resume.pdf, L1) and preview image, then its
// _headers and robots.txt. Nothing from any other version is copied (V3).
//
// Usage: node scripts/assemble-public.mjs <id>
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVersion, VersionError } from '../versions/load.mjs';
import { writeHeaders } from './write-headers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const RESUME_NAME = 'Aditya-Gupta-Resume.pdf';

/** Returns the absolute path of the assembled folder. Throws VersionError. */
export function assemblePublic(id) {
  // loadVersion checks the id is a known slug before any path below is built from it.
  const settings = loadVersion(id);
  const sharedDir = join(ROOT, 'public');
  const outDir = join(ROOT, '.build', `public-${settings.id}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  if (existsSync(sharedDir)) {
    // .gitkeep only exists so git keeps the empty folder; it is not a site file.
    // A symlink is refused: git tracks only the link, but the copy would publish its target,
    // which could be a private file.
    cpSync(sharedDir, outDir, {
      recursive: true,
      filter: (src) => {
        if (lstatSync(src).isSymbolicLink()) {
          throw new VersionError(
            `public/${relative(sharedDir, src)}: links are not allowed in public/; copy the file in`,
          );
        }
        return basename(src) !== '.gitkeep';
      },
    });
  }
  copyFileSync(join(settings.dir, settings.resumeFile), join(outDir, RESUME_NAME));
  copyFileSync(join(settings.dir, settings.ogImage), join(outDir, 'og.png'));
  writeHeaders(settings, outDir);
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assemblePublic(process.argv[2]);
  } catch (err) {
    if (!(err instanceof VersionError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}
