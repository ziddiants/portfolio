// TC-B16 (ENG-06, N11): VF-16 finds a fake key and lets an allow-listed value through.
// The fake key is made at test time in a temp folder and never committed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import vf16 from '../../scripts/verify/rules/vf-16.mjs';
import { ctxFor, fakeToken, git, tempRepo, writeFiles } from './helpers.mjs';

const page = (token) => `<p>one</p>\n<p>two</p>\n<script>const k = "${token}";</script>\n`;
const distCtx = (repo) => ctxFor(repo, { distDir: join(repo, 'dist', 'payments') });

describe('TC-B16: VF-16 secrets', () => {
  const oldPath = process.env.PATH;
  afterEach(() => {
    process.env.PATH = oldPath;
  });

  test('a clean repo and a clean build pass', () => {
    const repo = tempRepo({ 'README.md': 'hi\n' });
    writeFiles(repo, { 'dist/payments/index.html': '<p>clean</p>\n' });
    expect(vf16.run(distCtx(repo))).toEqual([]);
  });

  test('a fake key in the built site fails, with file and line', () => {
    const repo = tempRepo();
    writeFiles(repo, { 'dist/payments/index.html': page(fakeToken()) });
    const found = vf16.run(distCtx(repo));
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe('dist/payments/index.html');
    expect(found[0].line).toBe(3);
    expect(found[0].message).toMatch(/secret found \(github-pat\)/);
    expect(found[0].fix).toMatch(/rotate the key/);
  });

  test('a fake key in a git commit fails', () => {
    const repo = tempRepo({ 'src/config.js': `export const k = "${fakeToken()}";\n` });
    const found = vf16.run(ctxFor(repo));
    expect(found.map((f) => f.file)).toEqual(['src/config.js']);
    expect(found[0].message).toMatch(/in commit/);
  });

  test('a key staged for commit fails in staged mode, and an unstaged one is not scanned', () => {
    const repo = tempRepo();
    writeFiles(repo, { 'a.js': `const k = "${fakeToken()}";\n` });
    git(repo, 'add', 'a.js');
    writeFiles(repo, { 'b.js': `const k = "${fakeToken()}";\n` });
    const found = vf16.run(ctxFor(repo, { staged: ['a.js'] }));
    expect(found.map((f) => f.file)).toEqual(['a.js']);
  });

  test('the same value passes once its fingerprint is in .gitleaksignore', () => {
    const repo = tempRepo();
    writeFiles(repo, { 'dist/payments/index.html': page(fakeToken()) });
    const first = vf16.run(distCtx(repo));
    expect(first).toHaveLength(1);
    writeFileSync(join(repo, '.gitleaksignore'), `${first[0].fingerprint}\n`);
    expect(vf16.run(distCtx(repo))).toEqual([]);
    // The allow-list names one file, one rule and one line. A second key on another line still fails.
    writeFiles(repo, { 'dist/payments/index.html': page(fakeToken()) + page(fakeToken()) });
    expect(vf16.run(distCtx(repo)).length).toBeGreaterThan(0);
  });

  test('a missing gitleaks is a failure, never a pass', () => {
    const repo = tempRepo();
    // A PATH folder that holds git and nothing else, so only gitleaks is missing.
    const bin = mkdtempSync(join(tmpdir(), 'only-git-'));
    symlinkSync(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim(), join(bin, 'git'));
    process.env.PATH = bin;
    const found = vf16.run(ctxFor(repo));
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/gitleaks is not installed/);
  });

  test('a folder that is not a git repository is a failure, never a pass', () => {
    const found = vf16.run(ctxFor('/tmp'));
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/not a git repository/);
  });

  test('a gitleaks error (missing build folder) is a failure, never a pass', () => {
    const repo = tempRepo();
    const found = vf16.run(ctxFor(repo, { distDir: join(repo, 'dist', 'missing') }));
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/gitleaks failed/);
  });
});
