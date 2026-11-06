// VF-06: forbidden files in git (ENG-06, N10/N12). Private documents, the teammate names list,
// .env files and .inputs/ content must never be tracked or staged in this public repo.
// The pre-commit hook runs this rule on the staged files. A build runs it on every tracked file.
import { spawnSync } from 'node:child_process';

// Case-insensitive. The same list the ENG-02 hook used; this file is now its only copy.
export const FORBIDDEN = [
  /(^|\/)\.env/i, // .env, .env.local, .env-prod, .envrc
  /\.env$/i, // prod.env, secrets.env
  /(^|\/)\.inputs\//i,
  /(^|\/)names\.txt$/i,
  /(^|\/)private\//i,
  // The résumé keeps the phone number: never in git, under any name (D88, ENG-09 review).
  /(^|[/ _.-])(r[eé]sum[eé]s?|cv)([ _.-][^/]*)?\.pdf$/i,
  /(^|\/)r[eé]sum[eé]s\//i,
  // The only PDFs in git are the three case studies (ENG-08); any other PDF is a stray.
  /^(?!public\/case-studies\/[^/]+\.pdf$).*\.pdf$/i,
  /\.private\./i,
  /(^|\/)(PRD|PRD-Brief|Architecture|design-brand|build-plan|content-sources|content-pack|alignment-audit)\.md$/i,
  /(^|\/)Past Mistakes and Lessons\.md$/i,
  /(^|\/)project-CLAUDE\.md$/i,
];

export default {
  id: 'VF-06',
  title: 'Forbidden files in git',
  checks: ['tracked'],
  needsPrivate: false,
  pendable: false, // a privacy rule: never on the pending list
  run(ctx) {
    let files = ctx.staged;
    if (files === null) {
      const r = spawnSync('git', ['ls-files', '-z'], { cwd: ctx.root, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
      files = r.stdout.split('\0').filter(Boolean);
    }
    return files
      .filter((f) => FORBIDDEN.some((p) => p.test(f)))
      .map((file) => ({
        file,
        message: 'a private file is in git',
        fix: `run: git rm --cached "${file}" (private files live in the vault, not in this repo)`,
      }));
  },
};
