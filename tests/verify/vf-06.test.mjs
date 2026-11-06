// VF-06 tests (ENG-06): every forbidden path pattern is caught, and ordinary files pass.
import { describe, expect, test } from 'vitest';
import vf06 from '../../scripts/verify/rules/vf-06.mjs';
import { ctxFor, tempRepo } from './helpers.mjs';

const FORBIDDEN = [
  '.env',
  '.env.local',
  '.envrc',
  '.env-prod',
  'prod.env',
  'config/secrets.env',
  'app/.env.production',
  '.inputs/raw.pdf',
  'names.txt',
  'private/names.txt',
  'notes.private.md',
  'PRD.md',
  'docs/Architecture.md',
  'build-plan.md',
  'content-sources.md',
  'Past Mistakes and Lessons.md',
  'project-CLAUDE.md',
  // The résumé keeps the phone number (D88): never tracked, under any usual name.
  'resume.pdf',
  'versions/payments/resume.pdf',
  'Aditya-Gupta-Resume.pdf',
  'dist/payments/Aditya-Gupta-Resume.pdf',
  'Resume-2026.PDF',
  // Review finding 4: other names for the same file, and any PDF outside the case-study folder.
  'Résumé.pdf',
  'my-resume.pdf',
  'CV.pdf',
  'Aditya Gupta Resume.pdf',
  'public/Aditya_Gupta_Resume.pdf',
  'public/case-studies/Aditya-CV.pdf',
  'resumes/payments.pdf',
  'resumes/allow.json', // the private résumé allow file and manifest, if copied in
  'resumes/manifest.json',
  'docs/notes.pdf',
  'tests/fixtures/sample.pdf',
];
const FINE = [
  'README.md',
  'src/pages/index.astro',
  'package.json',
  'environment.md',
  'tests/fixtures/pages-a07/404.html',
  'public/case-studies/Vendrax.pdf', // a cohort PDF is not a résumé
  'public/case-studies/NyaySetu.pdf',
  'src/curved.md',
  'docs/resumed.md',
];

describe('VF-06 forbidden files in git', () => {
  test.each(FORBIDDEN)('tracked %s is a finding', (path) => {
    const repo = tempRepo({ [path]: 'x\n', 'README.md': 'ok\n' });
    const found = vf06.run(ctxFor(repo));
    expect(found.map((f) => f.file)).toEqual([path]);
    expect(found[0].fix).toMatch(/git rm --cached/);
  });

  test('ordinary files pass', () => {
    const repo = tempRepo(Object.fromEntries(FINE.map((f) => [f, 'x\n'])));
    expect(vf06.run(ctxFor(repo))).toEqual([]);
  });

  test('with a staged list it checks that list, not the whole repo', () => {
    const repo = tempRepo({ 'PRD.md': 'x\n' });
    expect(vf06.run(ctxFor(repo, { staged: ['README.md'] }))).toEqual([]);
    expect(vf06.run(ctxFor(repo, { staged: ['PRD.md'] })).map((f) => f.file)).toEqual(['PRD.md']);
  });

  test('a git failure is a crash, not a pass', () => {
    expect(() => vf06.run(ctxFor('/no/such/folder'))).toThrow();
  });
});
