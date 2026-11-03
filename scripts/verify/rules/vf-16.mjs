// VF-16: secrets (ENG-06, N11). gitleaks scans the git history and the built site.
// With staged files (the pre-commit hook) it scans only what is about to be committed.
// A public value, such as the Vendrax demo login, is allowed by its fingerprint in
// .gitleaksignore (file, rule and line), never by a wildcard.
import { spawnSync } from 'node:child_process';
import { relative } from 'node:path';
import { scan } from '../gitleaks.mjs';

export default {
  id: 'VF-16',
  title: 'Secrets',
  needsPrivate: false,
  run(ctx) {
    // gitleaks exits 0 for a folder that is not a git repository, which would be a silent pass.
    const inRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: ctx.root,
      encoding: 'utf8',
    });
    if (inRepo.status !== 0) {
      return [
        {
          file: '',
          message: 'this is not a git repository, so the secret scan could not run',
          fix: 'run verify inside the repository checkout',
        },
      ];
    }
    if (ctx.staged !== null) return scan(ctx.root, ['git', '--staged']);
    const findings = scan(ctx.root, ['git']);
    // A relative path keeps the fingerprints in .gitleaksignore the same on every machine.
    if (ctx.distDir) findings.push(...scan(ctx.root, ['dir', relative(ctx.root, ctx.distDir)]));
    return findings;
  },
};
