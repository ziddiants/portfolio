// The verify step. Every build runs it on dist/<id>/, and `npm run verify` runs it on all of them.
// It runs every rule in scripts/verify/rules/ and prints each finding with the file, the line
// and a plain fix. Any finding means exit code 1 (ENG-06, ENG-07, N11). Pending checks (D80)
// are printed apart and do not fail the run.
//
// Usage: node scripts/verify/index.mjs [<dist folder> …] [--ci]
//   no folder   every version's dist/<id>/ (a missing one is a failure)
//   --ci        or VERIFY_MODE=ci inside CI: rules that need the private folder report "skipped"
// The folder's name is the version id, so dist/<id>/ is checked against versions/<id>/.
import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVersions, loadVersion, VersionError } from '../../versions/load.mjs';
import { privateDir } from './lib/private.mjs';
import { PENDING } from './pending.mjs';
import { formatFinding, formatPending, loadRules, runRules } from './runner.mjs';

// Every rule that must exist (ERD § Guardrails). A deleted rule file is a failure.
// No "is this the main module" check: through a symlinked path it can be false, and verify
// would then do nothing and exit 0 (found in the ENG-07 review).
const REQUIRED_RULES = Array.from({ length: 16 }, (_, i) => `VF-${String(i + 1).padStart(2, '0')}`);

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
// CI mode skips the private rules, so VERIFY_MODE=ci counts only inside CI (GitHub sets CI=true).
// A VERIFY_MODE=ci left in a local shell must not turn VF-02 and VF-05 off for a build or a
// release (review finding F6). The --ci flag (npm run verify:ci) is an explicit request.
const envCi = process.env.VERIFY_MODE === 'ci';
const inCi = process.env.CI === 'true';
const mode = args.includes('--ci') || (envCi && inCi) ? 'ci' : 'local';
if (envCi && !inCi)
  console.error('verify: VERIFY_MODE=ci is ignored outside CI; running local mode');
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
  let version;
  let others;
  try {
    version = loadVersion(basename(distDir));
    others = listVersions()
      .filter((id) => id !== version.id)
      .map((id) => loadVersion(id));
  } catch (err) {
    if (!(err instanceof VersionError)) throw err;
    console.error(`verify: ${target} is not a version build: ${err.message}`);
    failed = true;
    continue;
  }
  const result = runRules(
    rules,
    { root: ROOT, distDir, mode, staged: null, privateDir: privateDir(), version, others },
    REQUIRED_RULES,
    PENDING,
  );
  for (const f of result.findings) console.error(formatFinding(f));
  for (const line of formatPending(result.pending)) console.log(line);
  const skipped = result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : '';
  const checks = new Set(result.pending.map((f) => `${f.rule}/${f.check}`));
  const pending = checks.size > 0 ? `, ${checks.size} checks pending` : '';
  if (result.findings.length > 0) {
    console.error(
      `verify: FAILED on ${target} (${result.findings.length} findings${skipped}${pending})`,
    );
    failed = true;
  } else {
    console.log(`verify: ${result.passed.length} rules passed${skipped}${pending} on ${target}`);
  }
}
process.exit(failed ? 1 : 0);
