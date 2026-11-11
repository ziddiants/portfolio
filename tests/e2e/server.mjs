// The server Playwright starts (ENG-12, D98). It serves three sites:
//   4331  dist/payments        4332  dist/consumer        4333  the component fixture
// It runs after `npm run build`; a missing dist/<id> stops it with exit code 1, so the suite can
// never pass on a site that was not built. The fixture is built here in a temp copy of the repo.
//
// Env: E2E_DIST_ROOT overrides the dist/ folder (the test of the missing-build guard uses it).
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkNodeModules } from '../link-node-modules.mjs';
import { FIXTURE_PAGE, SAMPLE_BYTES } from './fixture-page.mjs';
import { PORTS } from './ports.mjs';
import { serve } from './static-server.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const DIST = process.env.E2E_DIST_ROOT || join(REPO, 'dist');

for (const id of ['payments', 'consumer']) {
  if (!existsSync(join(DIST, id, 'index.html'))) {
    console.error(`e2e: ${join(DIST, id, 'index.html')} is missing. Run "npm run build" first.`);
    process.exit(1);
  }
}

/** Builds the fixture site in a temp copy of the repo; returns { copy, dist }. */
function buildFixture() {
  const copy = mkdtempSync(join(tmpdir(), 'eng12-fixture-'));
  // Only regular files git sees (tracked, or new and not ignored): never CLAUDE.md or .inputs/.
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: REPO,
      encoding: 'utf8',
    },
  );
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  const files = listed.stdout
    .split('\0')
    .filter((f) => f && existsSync(join(REPO, f)) && lstatSync(join(REPO, f)).isFile());
  if (files.length === 0) throw new Error('git ls-files listed no files');
  for (const f of files) cpSync(join(REPO, f), join(copy, f), { recursive: false });
  linkNodeModules(copy);
  writeFileSync(join(copy, 'src', 'pages', 'fixture.astro'), FIXTURE_PAGE);
  // The fixture needs one real file to link to; assemble-public (and its résumé) is not run.
  mkdirSync(join(copy, '.build', 'public-payments'), { recursive: true });
  writeFileSync(join(copy, '.build', 'public-payments', 'sample.pdf'), Buffer.alloc(SAMPLE_BYTES));
  const r = spawnSync(join(copy, 'node_modules', '.bin', 'astro'), ['build'], {
    cwd: copy,
    env: { ...process.env, SITE_VERSION: 'payments' },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stdout + r.stderr);
    throw new Error('e2e: the fixture build failed');
  }
  return { copy, dist: join(copy, 'dist', 'payments') };
}

const { copy, dist: fixtureDist } = buildFixture();
const servers = [
  await serve(join(DIST, 'payments'), PORTS.payments),
  await serve(join(DIST, 'consumer'), PORTS.consumer),
  await serve(fixtureDist, PORTS.fixture),
];
console.log(
  `e2e: serving payments :${PORTS.payments}, consumer :${PORTS.consumer}, fixture :${PORTS.fixture}`,
);

function stop() {
  for (const s of servers) s.close();
  rmSync(copy, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
