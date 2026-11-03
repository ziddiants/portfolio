// The verify step. Every build runs it on dist/<id>/, and `npm run verify` runs it on all of them.
// It runs every rule in scripts/verify/rules/ and prints each finding with the file, the line
// and a plain fix. Any finding means exit code 1 (ENG-06, N11).
//
// Usage: node scripts/verify/index.mjs [<dist folder> …] [--ci]
//   no folder   every version's dist/<id>/ (a missing one is a failure)
//   --ci        or VERIFY_MODE=ci: rules that need the private folder report "skipped"
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVersions } from '../../versions/load.mjs';
import { formatFinding, loadRules, runRules } from './runner.mjs';

// Every rule that must exist. ENG-07 adds the other 14 ids here.
const REQUIRED_RULES = ['VF-06', 'VF-16'];

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const mode = args.includes('--ci') || process.env.VERIFY_MODE === 'ci' ? 'ci' : 'local';
const targets = args.filter((a) => !a.startsWith('--'));
if (targets.length === 0) targets.push(...listVersions().map((id) => `dist/${id}`));

const rules = await loadRules(join(ROOT, 'scripts', 'verify', 'rules'));
let failed = false;

if (targets.length === 0) {
  console.error('verify: no version folders in versions/, so there is nothing to check');
  process.exit(1);
}
for (const target of targets) {
  const distDir = resolve(ROOT, target);
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error(`verify: no build folder at ${target}`);
    failed = true;
    continue;
  }
  const result = runRules(
    rules,
    {
      root: ROOT,
      distDir,
      mode,
      staged: null,
      privateAvailable: existsSync(join(ROOT, 'private')),
    },
    REQUIRED_RULES,
  );
  for (const f of result.findings) console.error(formatFinding(f));
  const skipped = result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : '';
  if (result.findings.length > 0) {
    console.error(`verify: FAILED on ${target} (${result.findings.length} findings${skipped})`);
    failed = true;
  } else {
    console.log(`verify: ${result.passed.length} rules passed${skipped} on ${target}`);
  }
}
process.exit(failed ? 1 : 0);
