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
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
// Like the real Wrangler: write one deployment record to WRANGLER_OUTPUT_FILE_PATH.
// FAKE_MODE: "none" writes nothing; "production" and "wrong-project" write a bad record.
const mode = process.env.FAKE_MODE;
if (mode !== 'none') {
  const project = args[args.indexOf('--project-name') + 1];
  appendFileSync(
    process.env.WRANGLER_OUTPUT_FILE_PATH,
    JSON.stringify({
      type: 'pages-deploy-detailed',
      pages_project: mode === 'wrong-project' ? 'someone-else' : project,
      url: 'https://abc123.' + project + '.pages.dev',
      alias: 'https://' + args[args.indexOf('--branch') + 1] + '.' + project + '.pages.dev',
      environment: mode === 'production' ? 'production' : 'preview',
    }) + '\\n',
  );
}
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
// VF-02 and VF-05 need private files; a fake folder with made-up entries stands in (ENG-07).
const PRIVATE = mkdtempSync(join(tmpdir(), 'release-private-'));
writeFileSync(join(PRIVATE, 'names.txt'), '# made up\nZorvath Quell\n');
writeFileSync(
  join(PRIVATE, 'content-sources.md'),
  '| ID | Source |\n| --- | --- |\n| S-001 | test |\n',
);
after(() => rmSync(PRIVATE, { recursive: true, force: true }));

function release(copy, args = ['--env', 'preview'], fakeMode = '') {
  const env = {
    ...process.env,
    WRANGLER_BIN: copy.fake,
    FAKE_LOG: copy.log,
    FAKE_MODE: fakeMode,
    PORTFOLIO_PRIVATE_DIR: PRIVATE,
    VERIFY_MODE: '',
  };
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
    assert.match(r.out, /use --env preview/);
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
    assert.match(r.out, /consumer/);
    assert.equal(r.calls.length, 0);
  });
});

describe('release deploys exactly what it just built', () => {
  test('one deploy per version, to its project, branch and commit', () => {
    const copy = makeCopy('m0-test');
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
      assert.match(r.out, new RegExp(`https://m0-test\\.${pagesProject}\\.pages\\.dev`));
    }
  });
});

describe('release does not trust "wrangler exited 0" alone', () => {
  test('no deployment record: the release fails', () => {
    const r = release(makeCopy('m0-test'), ['--env', 'preview'], 'none');
    assert.equal(r.status, 1);
    assert.match(r.out, /release stopped: wrangler wrote no deployment record/);
    assert.ok(!/preview release done/.test(r.out));
  });

  test('a production record: the release fails and says so', () => {
    const r = release(makeCopy('m0-test'), ['--env', 'preview'], 'production');
    assert.equal(r.status, 1);
    assert.match(r.out, /release stopped: .*went to the "production" environment/);
    assert.equal(r.calls.length, 1, 'it stops after the first version');
  });

  test('a record for another project: the release fails', () => {
    const r = release(makeCopy('m0-test'), ['--env', 'preview'], 'wrong-project');
    assert.equal(r.status, 1);
    assert.match(r.out, /release stopped: .*someone-else/);
  });
});
