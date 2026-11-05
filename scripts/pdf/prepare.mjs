// npm run pdf:prepare — the cohort PDF pipeline (ENG-08; ERD § Assets), steps 1–9: take the
// inputs from .inputs/, convert a DOCX, check the text layer, scan for names, phone numbers,
// email addresses, links, comments and active content, apply the "we" rule, clean the metadata,
// check the size, list the pages with images, and write all three files to
// public/case-studies/. Any finding exits 1 and writes nothing.
//
// No "is this the main module" check: through a symlinked path it can be false, and the script
// would then do nothing and exit 0 (ENG-07 lesson).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDir } from '../verify/lib/private.mjs';
import { formatItem, prepare } from './pipeline.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'pdf-prepare-'));
let code = 1;
try {
  const { findings, notes, files } = prepare({
    inputsDir: join(ROOT, '.inputs'),
    privateDir: privateDir(),
    allowFile: join(ROOT, 'scripts', 'pdf', 'allow.json'),
    workDir,
    outDir: join(ROOT, 'public', 'case-studies'),
  });
  for (const n of notes) console.log(formatItem(n, '·'));
  for (const f of findings) console.error(formatItem(f));
  if (findings.length > 0) {
    for (const f of files) console.log(`  · ${f.source}: ${f.pages} pages`);
    console.error(`pdf:prepare: FAILED (${findings.length} findings). Nothing was written.`);
  } else {
    for (const f of files) {
      console.log(
        `  ✓ ${f.source} → ${relative(ROOT, f.output)}: ${f.pages} pages, ` +
          `${(f.bytes / 1_000_000).toFixed(1)} MB, sha256 ${f.sha256}`,
      );
      console.log(
        `      step 9: images on ${f.imagePages.length ? `pages ${f.imagePages.join(', ')}` : 'no page'}`,
      );
    }
    console.log(
      `pdf:prepare: all 9 steps passed; wrote ${files.length} files.\n` +
        'Step 9 (TC-I05): Aditya skims every page of each written file for names in pictures, ' +
        'the listed pages first (vector drawings are not on the list). Commit nothing before that.',
    );
    code = 0;
  }
} catch (err) {
  console.error(`pdf:prepare: FAILED: ${err.message}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
process.exit(code);
