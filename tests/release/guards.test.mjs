// Release guard tests (ENG-05): the minimal release refuses unsafe states and deploys exactly
// what it just built. Offline: a fake wrangler records its calls, nothing reaches Cloudflare.
// Every run happens in a temp git copy of the repo, so the working tree is never touched.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
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
import { after, describe, test } from 'node:test';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const FILES = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: REPO,
  encoding: 'utf8',
})
  .stdout.split('\0')
  .filter((f) => f && existsSync(join(REPO, f)) && lstatSync(join(REPO, f)).isFile());
const copies = [];

const FAKE_WRANGLER = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.FAKE_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
`;

const sh = (dir, cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
const git = (dir, ...args) =>
  sh(dir, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args]);

/** A committed git copy of the repo on branch `branch`, plus a fake wrangler and its call log. */
function makeCopy(branch) {
  const dir = mkdtempSync(join(tmpdir(), 'eng05-release-'));
  copies.push(dir);
  for (const file of FILES) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    cpSync(join(REPO, file), join(dir, file));
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  git(dir, 'init', '-q', '-b', branch);
  // A symlink is not matched by the "node_modules/" rule, so exclude it by hand.
  writeFileSync(
    join(dir, '.git', 'info', 'exclude'),
    'node_modules\ndist\n.build\nfake-wrangler\n',
  );
  const fake = join(dir, 'fake-wrangler');
  writeFileSync(fake, FAKE_WRANGLER);
  chmodSync(fake, 0o755);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'test copy');
  return { dir, fake, log: join(dir, 'wrangler-calls.log') };
}

/** Runs the release in the copy. Returns exit status, output and the recorded wrangler calls. */
function release(copy, args = ['--env', 'preview']) {
  const env = { ...process.env, WRANGLER_BIN: copy.fake, FAKE_LOG: copy.log };
  delete env.SITE_VERSION;
  const r = spawnSync('node', ['scripts/release.mjs', ...args], {
    cwd: copy.dir,
    env,
    encoding: 'utf8',
  });
  const calls = existsSync(copy.log)
    ? readFileSync(copy.log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  return { status: r.status, out: r.stdout + r.stderr, calls };
}

after(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

describe('release refuses unsafe states and calls wrangler zero times', () => {
  test('--env production', () => {
    const r = release(makeCopy('feature'), ['--env', 'production']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ENG-30/);
    assert.equal(r.calls.length, 0);
  });

  test('no --env', () => {
    const r = release(makeCopy('feature'), []);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 0);
  });

  test('dirty working tree', () => {
    const copy = makeCopy('feature');
    writeFileSync(join(copy.dir, 'stray.txt'), 'x');
    const r = release(copy);
    assert.equal(r.status, 1);
    assert.match(r.out, /not clean/);
    assert.equal(r.calls.length, 0);
  });

  test('branch main (a deploy to main is production)', () => {
    const r = release(makeCopy('main'));
    assert.equal(r.status, 1);
    assert.match(r.out, /this is main/);
    assert.equal(r.calls.length, 0);
  });

  test('detached HEAD', () => {
    const copy = makeCopy('feature');
    git(copy.dir, 'checkout', '-q', '--detach');
    const r = release(copy);
    assert.equal(r.status, 1);
    assert.match(r.out, /detached/);
    assert.equal(r.calls.length, 0);
  });

  test('a bad version file stops before any deploy', () => {
    const copy = makeCopy('feature');
    writeFileSync(join(copy.dir, 'versions', 'consumer', 'version.json'), '{ not json');
    git(copy.dir, 'commit', '-q', '-a', '-m', 'break consumer');
    const r = release(copy);
    assert.equal(r.status, 1);
    assert.equal(r.calls.length, 0);
  });
});

describe('release deploys exactly what it just built', () => {
  test('one deploy per version, to its project, branch and commit; a stale dist/ folder is skipped', () => {
    const copy = makeCopy('m0-test');
    mkdirSync(join(copy.dir, 'dist', 'old'), { recursive: true });
    writeFileSync(join(copy.dir, 'dist', 'old', 'index.html'), 'stale');
    const sha = git(copy.dir, 'rev-parse', 'HEAD').stdout.trim();
    const r = release(copy);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.calls.length, 2);
    const byDir = Object.fromEntries(r.calls.map((c) => [c[2], c]));
    assert.deepEqual(Object.keys(byDir).sort(), ['dist/consumer', 'dist/payments']);
    for (const id of ['payments', 'consumer']) {
      const { pagesProject } = JSON.parse(
        readFileSync(join(copy.dir, 'versions', id, 'version.json'), 'utf8'),
      );
      assert.deepEqual(byDir[`dist/${id}`], [
        'pages',
        'deploy',
        `dist/${id}`,
        '--project-name',
        pagesProject,
        '--branch',
        'm0-test',
        '--commit-hash',
        sha,
      ]);
    }
  });
});
