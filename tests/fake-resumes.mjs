// Test helper (ENG-09, D89): writes a fake clean résumé for every version into a fake private
// folder, so a local-mode test build finds one. Each résumé holds that version's own
// approvedNumbers, so VF-08 can match them. Made-up text only; never the real résumés.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubResumePdf, writeManifest } from '../versions/resume.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));

export function writeFakeResumes(privateDir, root = REPO) {
  const versions = join(root, 'versions');
  mkdirSync(join(privateDir, 'resumes'), { recursive: true });
  const ids = [];
  for (const e of readdirSync(versions, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    ids.push(e.name);
    const settings = JSON.parse(readFileSync(join(versions, e.name, 'version.json'), 'utf8'));
    // The PDF is Latin-1 text: the rupee sign is written the way VF-08 reads it ("Rs"), and a
    // dash as a hyphen (VF-08 compares both as one).
    const figures = settings.approvedNumbers
      .map((n) => n.replace('₹', 'Rs ').replace(/[–—]/g, '-'))
      .join(', ');
    writeFileSync(
      join(privateDir, 'resumes', `${e.name}.pdf`),
      stubResumePdf([`Test figures: ${figures}`]),
    );
  }
  writeManifest(privateDir, ids);
}
