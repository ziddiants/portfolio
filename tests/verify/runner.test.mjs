// Runner tests (ENG-06): the runner fails closed. No rules, a crash, or a wrong shape is a failure.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { formatFinding, runRules } from '../../scripts/verify/runner.mjs';
import { ctxFor, git } from './helpers.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const pass = { id: 'T-1', run: () => [] };
const fail = {
  id: 'T-2',
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
      { rule: 'T-2', file: 'a.txt', line: 3, message: 'bad thing', fix: 'remove it' },
    ]);
    expect(formatFinding(r.findings[0])).toBe('  ✗ T-2 a.txt:3 — bad thing\n      fix: remove it');
  });

  test('no rules at all is a failure, not a pass', () => {
    const r = runRules([], ctxFor('/x'));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].message).toMatch(/nothing was checked/);
  });

  test('a rule that throws is a failure', () => {
    const boom = {
      id: 'T-3',
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
      const r = runRules([{ id: 'T-4', run: () => bad }], ctxFor('/x'));
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

  test('a rule that needs private files: local fails closed, CI skips, present runs', () => {
    const needs = { id: 'T-5', needsPrivate: true, run: () => [] };
    const local = runRules([needs], ctxFor('/x', { privateAvailable: false }));
    expect(local.findings[0].message).toMatch(/fails closed/);
    const ci = runRules([needs], ctxFor('/x', { privateAvailable: false, mode: 'ci' }));
    expect(ci.skipped).toEqual(['T-5']);
    expect(ci.findings).toEqual([]);
    const present = runRules([needs], ctxFor('/x', { privateAvailable: true }));
    expect(present.passed).toEqual(['T-5']);
  });
});

/** A small repo copy with the verify scripts, so the CLI can run for real. */
function cliRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-cli-'));
  for (const d of ['scripts', 'versions']) cpSync(join(REPO, d), join(dir, d), { recursive: true });
  cpSync(join(REPO, 'package.json'), join(dir, 'package.json'));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  for (const id of ['payments', 'consumer']) {
    mkdirSync(join(dir, 'dist', id), { recursive: true });
    writeFileSync(join(dir, 'dist', id, 'index.html'), '<p>hi</p>\n');
  }
  writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const cli = (dir, ...args) => {
  const r = spawnSync('node', ['scripts/verify/index.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { status: r.status, out: r.stdout + r.stderr };
};

describe('the verify command', () => {
  test('passes on a clean repo and says how many rules ran', () => {
    const dir = cliRepo();
    try {
      const r = cli(dir, 'dist/payments');
      expect(r.status, r.out).toBe(0);
      expect(r.out).toMatch(/verify: 2 rules passed on dist\/payments/);
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
