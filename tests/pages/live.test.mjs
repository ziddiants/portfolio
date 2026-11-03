// Live Pages tests (ENG-05): TC-K06, TC-E05, TC-A07. They talk to real Cloudflare Pages projects.
// Run them after `npm run release -- --env preview`. They deploy only the test fixture
// (tests/fixtures/pages-a07) to branch "tc-a07-fixture" of the first version's project.
//
// Usage: npm run test:pages        (PREVIEW_BRANCH overrides the branch the release deployed)
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, describe, test } from 'node:test';
import { listVersions, loadVersion } from '../../versions/load.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WRANGLER = process.env.WRANGLER_BIN ?? join(ROOT, 'node_modules', '.bin', 'wrangler');
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'pages-a07');
const FIXTURE_BRANCH = 'tc-a07-fixture';
if (process.env.PREVIEW_BRANCH === FIXTURE_BRANCH) {
  throw new Error(`PREVIEW_BRANCH must not be ${FIXTURE_BRANCH}: the fixture test overwrites it.`);
}

const versions = listVersions().map((id) => loadVersion(id));
const branch =
  process.env.PREVIEW_BRANCH ??
  spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout.trim();

/** A new *.pages.dev address sometimes fails the TLS handshake at first. Try a few times. */
async function get(url, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { redirect: 'manual' });
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error(`${url}: no answer after ${tries} tries (${last?.cause?.code ?? last})`);
}

// Cloudflare turns a branch name into a host label: lowercase, other characters become "-".
// It also shortens long names. The limit below is the documented one; a branch longer than
// this may need PREVIEW_BRANCH set by hand.
const MAX_ALIAS = 28;
const aliasLabel = (b) =>
  b
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ALIAS);
const alias = (b, project) => `https://${aliasLabel(b)}.${project}.pages.dev`;
const hasNoindex = (headers) => /noindex/i.test(headers.get('x-robots-tag') ?? '');

/** Project name → address, read from wrangler's JSON list. */
function liveProjects() {
  const r = spawnSync(WRANGLER, ['pages', 'project', 'list', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `wrangler could not list projects:\n${r.stdout}${r.stderr}`);
  // The JSON is on stdout. A banner line may come first, so start at the first line with "[".
  const lines = r.stdout.split('\n');
  const rows = JSON.parse(lines.slice(lines.findIndex((l) => l.startsWith('['))).join('\n'));
  return new Map(
    rows.map((row) => {
      const domains = row['Project Domains'] ?? row.subdomain;
      return [row['Project Name'] ?? row.name, Array.isArray(domains) ? domains[0] : domains];
    }),
  );
}

/** Every page in a build folder → its clean address path. 404.html is left out. */
function pagePaths(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out
    .filter((f) => f !== '404.html')
    .map((f) => (f === 'index.html' ? '/' : `/${f.replace(/\.html$/, '')}`));
}

describe('TC-K06: both Pages projects exist under the names in version.json', () => {
  test('each project exists and its address matches siteUrl', () => {
    const projects = liveProjects();
    for (const v of versions) {
      assert.ok(projects.has(v.pagesProject), `no Pages project named ${v.pagesProject}`);
      assert.equal(
        `https://${projects.get(v.pagesProject)}`,
        v.siteUrl,
        `${v.id}: address differs`,
      );
    }
  });

  test('the check can fail: a name that does not exist is not found', () => {
    assert.ok(!liveProjects().has('portfolio-tc-k06-no-such-project'));
  });
});

// The noindex header here comes from Cloudflare's own default for preview addresses. Our
// _headers file is a stub until ENG-23. If Cloudflare changes that default, this test fails.
describe('TC-E05: preview addresses send X-Robots-Tag: noindex', () => {
  for (const v of versions) {
    test(`${v.id}: ${branch} alias`, async () => {
      const res = await get(`${alias(branch, v.pagesProject)}/`);
      assert.equal(res.status, 200);
      assert.ok(
        hasNoindex(res.headers),
        `no noindex header; got: ${res.headers.get('x-robots-tag')}`,
      );
    });
  }

  test('the check can fail: headers without the tag are rejected', () => {
    assert.ok(!hasNoindex(new Headers({ 'content-type': 'text/html' })));
  });
});

describe('TC-A07 (a): URL format and 404 on Cloudflare, with the test fixture', () => {
  const project = versions[0].pagesProject;
  const base = alias(FIXTURE_BRANCH, project);

  before(() => {
    const r = spawnSync(
      WRANGLER,
      [
        'pages',
        'deploy',
        FIXTURE,
        '--project-name',
        project,
        '--branch',
        FIXTURE_BRANCH,
        '--commit-dirty=true',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(r.status, 0, `fixture deploy failed:\n${r.stdout}${r.stderr}`);
  });

  test('/ and /work/probe answer 200 with no redirect', async () => {
    for (const path of ['/', '/work/probe']) {
      const res = await get(`${base}${path}`);
      assert.equal(res.status, 200, `${path} gave ${res.status}`);
    }
  });

  test('/work/probe.html redirects once to /work/probe, which answers 200 (no loop)', async () => {
    const first = await get(`${base}/work/probe.html`);
    assert.ok([301, 302, 307, 308].includes(first.status), `got ${first.status}`);
    const target = new URL(first.headers.get('location'), base);
    assert.equal(target.pathname, '/work/probe');
    assert.equal((await get(target.href)).status, 200);
  });

  test('an unknown path answers 404 with the 404 page', async () => {
    const res = await get(`${base}/no-such-page`);
    assert.equal(res.status, 404);
    assert.match(await res.text(), /TC-A07 404 page/);
  });
});

describe('TC-A07 (b): every page in dist/<id> answers 200 at its clean path', () => {
  for (const v of versions) {
    test(`${v.id}`, async (t) => {
      const dir = join(ROOT, 'dist', v.id);
      if (!existsSync(dir)) return t.skip(`dist/${v.id} is missing; run npm run build`);
      const paths = pagePaths(dir);
      assert.ok(paths.length > 0, 'the build has no pages');
      for (const path of paths) {
        const res = await get(`${alias(branch, v.pagesProject)}${path}`);
        assert.equal(res.status, 200, `${v.id} ${path} gave ${res.status}`);
      }
    });
  }

  // D71: the real 404 page lands in ENG-23.
  test.skip('unknown path answers 404 on the real site (turns on at ENG-23, D71)', () => {});
});
