// Shared helpers for the verify tests. Everything is built in temp folders and deleted at the end.
// Fake secrets are made at test time and never written into the repo, so the repo's own scans
// (and GitHub push protection) stay clean.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll } from 'vitest';

const dirs = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

export const git = (dir, ...args) =>
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });

/** A GitHub-token-shaped string. Random each run. It is not a real token. */
export function fakeToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(36);
  return `ghp_${[...bytes].map((b) => chars[b % chars.length]).join('')}`;
}

/** Writes files (path → text) under a folder. */
export function writeFiles(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
}

/** A temp git repo. `files` are committed. Returns its path. */
export function tempRepo(files = { 'README.md': 'hello\n' }) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-test-'));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  writeFiles(dir, files);
  git(dir, 'add', '-f', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

/** A context for a rule, with sensible defaults. */
export const ctxFor = (root, extra = {}) => ({
  root,
  distDir: null,
  mode: 'local',
  staged: null,
  privateAvailable: true,
  ...extra,
});
