// npm run pdf:prepare — the cohort PDF pipeline (ENG-08; ERD § Assets). Steps 1–5 only for now:
// take the inputs from .inputs/, convert a DOCX, check the text layer, scan for names, phone
// numbers, email addresses, links, comments and active content, and apply the "we" rule. Any
// finding exits 1. It writes nothing to public/ yet (steps 6–9 come later in ENG-08).
//
// No "is this the main module" check: through a symlinked path it can be false, and the script
// would then do nothing and exit 0 (ENG-07 lesson).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  });
  for (const f of files) console.log(`  · ${f.source}: ${f.pages} pages`);
  for (const n of notes) console.log(formatItem(n, '·'));
  for (const f of findings) console.error(formatItem(f));
  if (findings.length > 0) {
    console.error(`pdf:prepare: FAILED (${findings.length} findings). Nothing was written.`);
  } else {
    console.log(
      `pdf:prepare: steps 1–5 clean on ${files.length} files. Steps 6–9 are not built yet; nothing was written.`,
    );
    code = 0;
  }
} catch (err) {
  console.error(`pdf:prepare: FAILED: ${err.message}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
process.exit(code);
