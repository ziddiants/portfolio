// Runner tests (ENG-06, ENG-07): the runner fails closed. No rules, a crash, a wrong shape, an
// undeclared check or a missing private file is a failure. Pending checks follow D80.
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { formatFinding, formatPending, runRules } from '../../scripts/verify/runner.mjs';
import { ctxFor, fakePrivate, git } from './helpers.mjs';
import { privateFiles } from './golden.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const pass = { id: 'T-1', checks: ['a'], run: () => [] };
const fail = {
  id: 'T-2',
  checks: ['x'],
  run: () => [{ file: 'a.txt', line: 3, message: 'bad thing', fix: 'remove it' }],
};

describe('runRules', () => {
  test('a passing rule is listed as passed', () => {
    const r = runRules([pass], ctxFor('/x'));
    expect(r.passed).toEqual(['T-1']);
    expect(r.findings).toEqual([]);
  });

  test('a finding keeps its rule id, file, line and fix', () => {
    const r = runRules([fail], ctxFor('/x'));
    expect(r.findings).toEqual([
      { rule: 'T-2', check: 'x', file: 'a.txt', line: 3, message: 'bad thing', fix: 'remove it' },
    ]);
    expect(formatFinding(r.findings[0])).toBe(
      '  ✗ T-2/x a.txt:3 — bad thing\n      fix: remove it',
    );
  });

  test('no rules at all is a failure, not a pass', () => {
    const r = runRules([], ctxFor('/x'));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].message).toMatch(/nothing was checked/);
  });

  test('a rule that throws is a failure', () => {
    const boom = {
      id: 'T-3',
      checks: ['a'],
      run: () => {
        throw new Error('kaboom');
      },
    };
    const r = runRules([boom], ctxFor('/x'));
    expect(r.passed).toEqual([]);
    expect(r.findings[0].message).toMatch(/crashed: kaboom/);
  });

  test('a rule that returns the wrong shape is a failure', () => {
    for (const bad of [undefined, null, 'ok', { length: 0 }]) {
      const r = runRules([{ id: 'T-4', checks: ['a'], run: () => bad }], ctxFor('/x'));
      expect(r.findings[0].message).toMatch(/did not return a list/);
    }
  });

  test('a required rule that is missing is a failure, even when the others pass', () => {
    const r = runRules([pass], ctxFor('/x'), ['T-1', 'T-9']);
    expect(r.passed).toEqual(['T-1']);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ rule: 'T-9' });
    expect(r.findings[0].message).toMatch(/required rule is missing/);
  });

  test('a module without id and run is a failure', () => {
    const r = runRules([{ file: 'broken.mjs' }], ctxFor('/x'));
    expect(r.findings[0].message).toMatch(/broken\.mjs must export/);
  });

  test('a rule that needs a private file: local fails closed, CI skips, present runs', () => {
    const needs = { id: 'T-5', checks: ['a'], needsPrivate: ['names.txt'], run: () => [] };
    const none = runRules([needs], ctxFor('/x', { privateDir: '/no/such/folder' }));
    expect(none.findings[0].message).toMatch(/needs names\.txt .* it is missing \(fails closed\)/);
    const ci = runRules([needs], ctxFor('/x', { privateDir: '/no/such/folder', mode: 'ci' }));
    expect(ci.skipped).toEqual(['T-5']);
    expect(ci.findings).toEqual([]);
    const ok = fakePrivate({ 'names.txt': 'Zorvath\n' });
    expect(runRules([needs], ctxFor('/x', { privateDir: ok })).passed).toEqual(['T-5']);
  });

  test('a private file with only comments and blank lines is empty, and fails closed', () => {
    const needs = { id: 'T-5', checks: ['a'], needsPrivate: ['names.txt'], run: () => [] };
    const dir = fakePrivate({ 'names.txt': '# only a comment\n\n   \n' });
    const r = runRules([needs], ctxFor('/x', { privateDir: dir }));
    expect(r.findings[0].message).toMatch(/it is empty \(fails closed\)/);
    expect(runRules([needs], ctxFor('/x', { privateDir: null })).findings).toHaveLength(1);
  });

  test('needsPrivate: true (no file names) is a broken rule, not a silent pass', () => {
    const r = runRules(
      [{ id: 'T-6', checks: ['a'], needsPrivate: true, run: () => [] }],
      ctxFor('/x'),
    );
    expect(r.findings[0].message).toMatch(/needsPrivate must list file names/);
  });

  test('a rule without checks, or a finding with an undeclared check, is a failure', () => {
    const noChecks = runRules([{ id: 'T-7', run: () => [] }], ctxFor('/x'));
    expect(noChecks.findings[0].message).toMatch(/must list its checks/);
    const two = { id: 'T-8', checks: ['a', 'b'], run: () => [{ message: 'm', fix: 'f' }] };
    expect(runRules([two], ctxFor('/x')).findings[0].message).toMatch(
      /undeclared check "undefined"/,
    );
    const typo = { id: 'T-8', checks: ['a'], run: () => [{ check: 'z', message: 'm', fix: 'f' }] };
    expect(runRules([typo], ctxFor('/x')).findings[0].message).toMatch(/undeclared check "z"/);
  });
});

describe('pending checks (D80)', () => {
  const rule = {
    id: 'T-9',
    checks: ['built', 'later', 'other'],
    run: () => [{ check: 'later', file: 'index.html', message: 'not built yet', fix: 'ENG-99' }],
  };

  test('a pending check is reported apart and does not fail the run', () => {
    const r = runRules([rule], ctxFor('/x'), [], { 'T-9/later': 'ENG-99' });
    expect(r.findings).toEqual([]);
    expect(r.passed).toEqual(['T-9']);
    expect(r.pending).toEqual([
      {
        rule: 'T-9',
        check: 'later',
        ticket: 'ENG-99',
        file: 'index.html',
        message: 'not built yet',
        fix: 'ENG-99',
      },
    ]);
    expect(formatPending(r.pending)).toEqual([
      '  … T-9/later pending (ENG-99): 1 finding, first index.html — not built yet',
    ]);
  });

  test('the same finding fails the run when its check is not pending', () => {
    const r = runRules([rule], ctxFor('/x'));
    expect(r.findings.map((f) => `${f.rule}/${f.check}`)).toEqual(['T-9/later']);
    expect(r.passed).toEqual([]);
  });

  test('the ratchet: a pending check that finds nothing fails the run until it is removed', () => {
    const r = runRules([rule], ctxFor('/x'), [], { 'T-9/later': 'ENG-99', 'T-9/other': 'ENG-98' });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ rule: 'T-9', check: 'other' });
    expect(r.findings[0].message).toBe('pending check T-9/other now passes');
    expect(r.findings[0].fix).toMatch(
      /remove 'T-9\/other' from scripts\/verify\/pending\.mjs \(owned by ENG-98\)/,
    );
    expect(r.passed).toEqual([]);
  });

  test('the ratchet asks only for checks that apply to this build', () => {
    const scoped = { ...rule, appliesTo: (check) => check !== 'other' };
    const r = runRules([scoped], ctxFor('/x'), [], {
      'T-9/later': 'ENG-99',
      'T-9/other': 'ENG-98',
    });
    expect(r.findings).toEqual([]);
  });

  test('a pending entry with an unknown check or rule is a failure', () => {
    const r = runRules([rule], ctxFor('/x'), [], { 'T-9/typo': 'ENG-1', 'T-0/x': 'ENG-1' });
    expect(r.findings.map((f) => f.message)).toEqual([
      'pending.mjs names "T-9/typo", which is not a check of T-9',
      'pending.mjs names "T-0/x", but there is no rule T-0',
      'not built yet', // T-9/later is not pending here, so it fails as usual
    ]);
  });

  test('F7: a privacy rule refuses pending entries (pendable: false)', () => {
    const privacy = { ...rule, pendable: false };
    const r = runRules([privacy], ctxFor('/x'), [], { 'T-9/later': 'ENG-99' });
    expect(r.findings.map((f) => f.message)).toContain(
      'pending.mjs names "T-9/later", but T-9 is a privacy rule and can never be pending',
    );
    expect(r.pending).toEqual([]);
  });

  test('a skipped rule (CI, no private file) is not asked to ratchet', () => {
    const needs = { ...rule, needsPrivate: ['names.txt'] };
    const ctx = ctxFor('/x', { mode: 'ci', privateDir: '/no/such/folder' });
    const r = runRules([needs], ctx, [], { 'T-9/other': 'ENG-98' });
    expect(r.findings).toEqual([]);
    expect(r.skipped).toEqual(['T-9']);
  });
});

/**
 * A small repo copy with the verify scripts and a dist/ shaped like today's placeholder build
 * (what ENG-04's stub writes), so the CLI runs for real with every check passing or pending.
 */
function cliRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-cli-'));
  for (const d of ['scripts', 'versions']) cpSync(join(REPO, d), join(dir, d), { recursive: true });
  cpSync(join(REPO, 'package.json'), join(dir, 'package.json'));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  for (const id of ['payments', 'consumer']) {
    const out = join(dir, 'dist', id);
    const v = JSON.parse(readFileSync(join(REPO, 'versions', id, 'version.json'), 'utf8'));
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, 'index.html'),
      `<!DOCTYPE html><html lang="en"><head><title>T</title></head><body><h1>Portfolio</h1><p>${v.heroSubline.replace('&', '&amp;')}</p></body></html>\n`,
    );
    copyFileSync(join(REPO, 'versions', id, 'resume.pdf'), join(out, 'Aditya-Gupta-Resume.pdf'));
    copyFileSync(join(REPO, 'versions', id, 'og.png'), join(out, 'og.png'));
    writeFileSync(join(out, '_headers'), `# ${id}: header stub\n`);
    writeFileSync(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    if (v.indexable) writeFileSync(join(out, 'sitemap-index.xml'), '<sitemapindex/>\n');
  }
  writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const PRIVATE = fakePrivate(privateFiles());
const cli = (dir, ...args) => {
  const r = spawnSync('node', ['scripts/verify/index.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PORTFOLIO_PRIVATE_DIR: PRIVATE, VERIFY_MODE: '' },
  });
  return { status: r.status, out: r.stdout + r.stderr };
};

describe('the verify command', () => {
  test('passes on the placeholder build: 16 rules pass, the rest is pending (D80)', () => {
    const dir = cliRepo();
    try {
      const r = cli(dir, 'dist/payments');
      expect(r.status, r.out).toBe(0);
      expect(r.out).toMatch(/verify: 16 rules passed, 10 checks pending on dist\/payments/);
      expect(r.out).toMatch(/… VF-14\/disclaimer pending \(ENG-20\)/);
      const c = cli(dir, 'dist/consumer');
      expect(c.status, c.out).toBe(0);
      expect(c.out).toMatch(/verify: 16 rules passed, 13 checks pending on dist\/consumer/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a planted fault fails the command, and a pending check that passes fails it too', () => {
    const dir = cliRepo();
    try {
      const page = join(dir, 'dist', 'payments', 'index.html');
      writeFileSync(
        page,
        readFileSync(page, 'utf8').replace('</body>', '<p>A robust plan</p></body>'),
      );
      const r = cli(dir, 'dist/payments');
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/✗ VF-07\/phrases index\.html — uses the stock phrase "robust"/);
      writeFileSync(join(dir, 'dist', 'consumer', 'robots.txt'), 'User-agent: *\nAllow: /\n');
      const c = cli(dir, 'dist/consumer');
      expect(c.status).toBe(1);
      expect(c.out).toMatch(/✗ VF-12\/robots-open — pending check VF-12\/robots-open now passes/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('run through a symlinked path, verify still runs and still fails (no silent exit 0)', () => {
    const dir = cliRepo();
    const link = join(mkdtempSync(join(tmpdir(), 'verify-link-')), 'repo');
    try {
      symlinkSync(dir, link, 'dir');
      const r = spawnSync('node', [join(link, 'scripts', 'verify', 'index.mjs'), 'dist/nope'], {
        cwd: link,
        encoding: 'utf8',
        env: { ...process.env, PORTFOLIO_PRIVATE_DIR: PRIVATE, VERIFY_MODE: '' },
      });
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toMatch(/verify: no build folder at dist\/nope/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(link, { force: true });
    }
  });

  test('F6: VERIFY_MODE=ci counts only in CI; outside CI the private rules still fail closed', () => {
    const dir = cliRepo();
    try {
      const run = (env) =>
        spawnSync('node', ['scripts/verify/index.mjs', 'dist/payments'], {
          cwd: dir,
          encoding: 'utf8',
          env: { ...process.env, PORTFOLIO_PRIVATE_DIR: '/no/such/folder', ...env },
        });
      const local = run({ VERIFY_MODE: 'ci', CI: '' });
      expect(local.status).toBe(1);
      expect(local.stdout + local.stderr).toMatch(/✗ VF-02 — this rule needs names\.txt/);
      expect(local.stdout + local.stderr).toMatch(/VERIFY_MODE=ci is ignored outside CI/);
      const ci = run({ VERIFY_MODE: 'ci', CI: 'true' });
      expect(ci.status, ci.stdout + ci.stderr).toBe(0);
      expect(ci.stdout).toMatch(/2 skipped/);
      expect(run({ CI: '' }).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a folder that is not a version build is a failure', () => {
    const dir = cliRepo();
    try {
      mkdirSync(join(dir, 'dist', 'nope'));
      const r = cli(dir, 'dist/nope');
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/verify: dist\/nope is not a version build: No folder versions\/nope/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('with no folder it checks every version, and a missing build is a failure', () => {
    const dir = cliRepo();
    try {
      expect(cli(dir).status).toBe(0);
      rmSync(join(dir, 'dist', 'consumer'), { recursive: true });
      const r = cli(dir);
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/verify: no build folder at dist\/consumer/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a deleted rule file makes the command fail, not pass with fewer rules', () => {
    const dir = cliRepo();
    try {
      rmSync(join(dir, 'scripts', 'verify', 'rules', 'vf-16.mjs'));
      const r = cli(dir, 'dist/payments');
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/✗ VF-16 — this required rule is missing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an empty rules folder makes the command fail', () => {
    const dir = cliRepo();
    try {
      rmSync(join(dir, 'scripts', 'verify', 'rules'), { recursive: true });
      mkdirSync(join(dir, 'scripts', 'verify', 'rules'));
      const r = cli(dir, 'dist/payments');
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/nothing was checked/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
