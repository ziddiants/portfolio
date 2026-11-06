// npm run resume:prepare — the résumé intake (ENG-09; D88, D89). Reads private/resumes/raw/,
// checks and cleans both résumés, and writes private/resumes/<id>.pdf. Any finding exits 1 and
// writes nothing. It prints no phone number: a message shows at most the last two digits.
//
// No "is this the main module" check (ENG-07 lesson: through a symlinked path it can be false,
// and the script would exit 0 without running).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDir } from '../verify/lib/private.mjs';
import { formatItem } from './pipeline.mjs';
import { prepareResumes } from './resume.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'resume-prepare-'));
let code = 1;
try {
  const { findings, notes, files } = prepareResumes({
    privateDir: privateDir(),
    allowFile: join(ROOT, 'scripts', 'pdf', 'allow.json'),
    workDir,
  });
  for (const n of notes) console.log(formatItem(n, '·'));
  for (const f of findings) console.error(formatItem(f));
  if (findings.length > 0) {
    console.error(`resume:prepare: FAILED (${findings.length} findings). Nothing was written.`);
  } else {
    for (const f of files) {
      console.log(
        `  ✓ ${f.source} → resumes/${f.id}.pdf: ${f.pages} pages, ` +
          `${(f.bytes / 1_000).toFixed(0)} KB, sha256 ${f.sha256}`,
      );
    }
    console.log(`resume:prepare: wrote ${files.length} files to ${join(privateDir(), 'resumes')}.`);
    code = 0;
  }
} catch (err) {
  console.error(`resume:prepare: FAILED: ${err.message}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
process.exit(code);
