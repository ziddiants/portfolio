// Minimal release: build and verify every version, then deploy each to a PREVIEW branch (ENG-05).
// ENG-30 grows this into the full gated release (production, smoke tests, tags, release log).
// It stops at the first failure and deploys nothing after it.
//
// Usage: npm run release -- --env preview
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVersions, loadVersion, VersionError } from '../versions/load.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = process.env.WRANGLER_BIN ?? join(ROOT, 'node_modules', '.bin', 'wrangler');

const deployed = [];

function stop(message) {
  const done =
    deployed.length === 0 ? 'Nothing was deployed.' : `Already deployed: ${deployed.join(', ')}.`;
  console.error(`\nrelease stopped: ${message}\n${done}`);
  process.exit(1);
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) stop(`git ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

/** The "--env" value, or undefined. */
function envArg(argv) {
  const i = argv.indexOf('--env');
  return i === -1 ? undefined : argv[i + 1];
}

/** Deployment and branch addresses from the lines wrangler wrote to its output file. */
function addresses(outputFile) {
  const urls = new Set();
  let text = '';
  try {
    text = readFileSync(outputFile, 'utf8');
  } catch {
    return [];
  }
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      const entry = JSON.parse(line);
      for (const key of ['url', 'alias']) if (entry[key]) urls.add(entry[key]);
    } catch {
      // A line that is not JSON is not an address.
    }
  }
  return [...urls];
}

const env = envArg(process.argv.slice(2));
if (env === 'production') stop('production releases are not available until ENG-30.');
if (env !== 'preview') stop('use --env preview.');

if (git(['status', '--porcelain']) !== '') {
  stop('the working tree is not clean. Commit or stash your changes first.');
}
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch === 'HEAD') stop('HEAD is detached. Check out a branch first.');
// The Pages projects use "main" as the production branch, so a deploy to "main" IS production.
if (branch === 'main') stop('this is main. A preview release must come from another branch.');
const sha = git(['rev-parse', 'HEAD']);

let versions;
try {
  const ids = listVersions();
  if (ids.length === 0) throw new VersionError('No version folders in versions/.');
  versions = ids.map((id) => loadVersion(id));
} catch (err) {
  if (!(err instanceof VersionError)) throw err;
  stop(err.message);
}

// Full build: it empties dist/, runs astro check, then builds and verifies each version.
const build = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build-all.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (build.status !== 0) stop('the build failed.');

const tmp = mkdtempSync(join(tmpdir(), 'release-'));
try {
  // Deploy only the folders this run just built, one per version.
  for (const s of versions) {
    console.log(`\n▶ ${s.id}: deploy dist/${s.id} to ${s.pagesProject} (branch ${branch})`);
    const outputFile = join(tmp, `${s.id}.ndjson`);
    const r = spawnSync(
      WRANGLER,
      [
        'pages',
        'deploy',
        `dist/${s.id}`,
        '--project-name',
        s.pagesProject,
        '--branch',
        branch,
        '--commit-hash',
        sha,
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile },
      },
    );
    if (r.status !== 0) {
      stop(
        `wrangler failed for ${s.id}. If it asks for an account, run: export CLOUDFLARE_ACCOUNT_ID=<your id>`,
      );
    }
    deployed.push(s.id);
    for (const url of addresses(outputFile)) console.log(`  ✓ ${url}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('\n✓ preview release done.');
