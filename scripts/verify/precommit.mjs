// What the pre-commit hook runs (ENG-06): VF-06 and VF-16 on the staged files only.
// The hook must fail closed. If this script cannot run, the commit is blocked.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatFinding, loadRules, runRules } from './runner.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PRECOMMIT_RULES = ['VF-06', 'VF-16'];

// Files being added, copied, modified or type-changed. A deleted file cannot leak anything.
// --no-renames: a renamed file must show up under its new name, or a rename to PRD.md would pass.
const staged = execFileSync(
  'git',
  ['diff', '--cached', '--no-renames', '--name-only', '--diff-filter=ACMT', '-z'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean);
if (staged.length === 0) process.exit(0);

const all = await loadRules(join(ROOT, 'scripts', 'verify', 'rules'));
const rules = all.filter((r) => PRECOMMIT_RULES.includes(r.id));
if (rules.length !== PRECOMMIT_RULES.length) {
  console.error(
    `pre-commit: expected rules ${PRECOMMIT_RULES.join(', ')} but found ${rules.length}`,
  );
  process.exit(1);
}

const result = runRules(rules, {
  root: ROOT,
  distDir: null,
  mode: 'local',
  staged,
  privateDir: null,
});
if (result.findings.length > 0) {
  console.error('\n  ✗ commit blocked (VF-06 private files, VF-16 secrets):\n');
  for (const f of result.findings) console.error(formatFinding(f));
  console.error('\n  Private docs live in the vault ~/my_builds/portfolio, not in this repo.\n');
  process.exit(1);
}
