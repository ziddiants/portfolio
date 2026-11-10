// Build tests for the multi-version build (ENG-04): TC-A01–A05 on real `astro build` runs.
// Every run happens in a temp copy of the repo (node_modules linked in), so the working tree
// is never edited (review C5). The copy is deleted at the end.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { stubResumePdf, writeManifest } from '../../versions/resume.mjs';
import { writeFakeRegister } from '../fake-register.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
// Only the regular files git sees (tracked, or new and not ignored): never CLAUDE.md, .env,
// .inputs/ or anything behind a symlink.
const FILES = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: REPO,
  encoding: 'utf8',
})
  .stdout.split('\0')
  .filter((f) => f && existsSync(join(REPO, f)) && lstatSync(join(REPO, f)).isFile());
const copies = [];

/** A fresh copy of the repo to build in. */
function makeCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'eng04-build-'));
  copies.push(dir);
  for (const file of FILES) cpSync(join(REPO, file), join(dir, file));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  // The real figures are ENG-09 data: the copy's settings use the test résumé's figure instead.
  for (const id of ['payments', 'consumer']) {
    const file = join(dir, 'versions', id, 'version.json');
    const settings = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...settings, approvedNumbers: ['46%'] }));
  }
  // VF-16 and VF-06 read git, so the copy must be a real repository. A symlink is not matched by
  // the "node_modules/" rule in .gitignore, so it is excluded by hand.
  const git = (...args) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: dir,
    });
  git('init', '-q', '-b', 'main');
  appendFileSync(join(dir, '.git', 'info', 'exclude'), 'node_modules\ndist\n.build\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'test copy');
  return dir;
}

// A fake private folder for VF-02 and VF-05 (made-up names; VF-06 forbids a tracked names.txt).
const PRIVATE = mkdtempSync(join(tmpdir(), 'eng04-private-'));
copies.push(PRIVATE);
writeFileSync(join(PRIVATE, 'names.txt'), '# made up\nZorvath Quell\n');
// A clean résumé per version (D89). Made-up text; VF-08 is satisfied by the test's own settings.
mkdirSync(join(PRIVATE, 'resumes'));
for (const id of ['payments', 'consumer']) {
  writeFileSync(join(PRIVATE, 'resumes', `${id}.pdf`), stubResumePdf(['Payment success 46%.']));
}
writeManifest(PRIVATE, ['payments', 'consumer']);
writeFakeRegister(PRIVATE);

function run(dir, args, env = {}) {
  const fullEnv = { ...process.env, PORTFOLIO_PRIVATE_DIR: PRIVATE, VERIFY_MODE: '', ...env };
  if (env.SITE_VERSION === undefined) delete fullEnv.SITE_VERSION;
  const r = spawnSync(args[0], args.slice(1), { cwd: dir, env: fullEnv, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}
const buildAll = (dir, ...ids) => run(dir, ['node', 'scripts/build-all.mjs', ...ids]);

/** Every file under a folder → its SHA-256, keyed by relative path. */
function tree(root) {
  const files = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files[relative(root, p)] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(root);
  return files;
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const editJson = (p, change) => writeFileSync(p, JSON.stringify(change(readJson(p)), null, 2));
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Settings that pages never show as text. Masking them would also hit shared words such as
// "payments", and TC-A02 would then fail with no real cause.
const NOT_SHOWN = new Set(['id', 'pagesProject', 'resumeFile', 'ogImage', 'indexable']);

/** Replaces every shown value from a version's settings with {{field}}: only shared HTML is left. */
function mask(html, settings) {
  const values = [];
  for (const [field, value] of Object.entries(settings)) {
    if (NOT_SHOWN.has(field)) continue;
    for (const item of [value].flat()) {
      if (typeof item === 'string') values.push([field, item]);
    }
  }
  values.sort((a, b) => b[1].length - a[1].length); // longest first: no partial replacement
  for (const [field, value] of values) {
    html = html.replaceAll(escapeHtml(value), `{{${field}}}`).replaceAll(value, `{{${field}}}`);
  }
  return html;
}

after(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

describe('a full build', () => {
  let dir;
  let result;
  before(() => {
    dir = makeCopy();
    result = buildAll(dir);
  });

  test('TC-A01: npm run build makes dist/payments and dist/consumer, each verified', () => {
    assert.equal(result.status, 0, result.out);
    for (const id of ['payments', 'consumer']) {
      assert.ok(existsSync(join(dir, 'dist', id, 'index.html')), `dist/${id}/index.html`);
      // All 16 rules ran on this version; every check passed or is pending (D70, D80).
      const pending = id === 'payments' ? 8 : 11;
      assert.match(
        result.out,
        new RegExp(`verify: 16 rules passed, ${pending} checks pending on dist/${id}\\b`),
      );
    }
    assert.deepEqual(readdirSync(join(dir, 'dist')).sort(), ['consumer', 'payments']);
    // The last line says what ran; with all 16 rule files present there is no gap note.
    assert.match(result.out, /✓ built and verified: consumer, payments\.\n/);
    assert.doesNotMatch(result.out, /of 16 verify rules exist/);
    assert.doesNotMatch(result.out, /STUB|stub/);
  });

  test('each build holds its own résumé and preview image under the shared names (L1)', () => {
    for (const id of ['payments', 'consumer']) {
      const out = join(dir, 'dist', id);
      assert.deepEqual(
        readFileSync(join(out, 'Aditya-Gupta-Resume.pdf')),
        readFileSync(join(PRIVATE, 'resumes', `${id}.pdf`)),
      );
      assert.deepEqual(
        readFileSync(join(out, 'og.png')),
        readFileSync(join(dir, 'versions', id, 'og.png')),
      );
      assert.ok(!existsSync(join(out, 'resume.pdf')), 'no file under its source name');
      assert.ok(!existsSync(join(out, '.gitkeep')), 'no .gitkeep');
    }
  });

  test('a sitemap only where indexable, and robots.txt blocks crawlers until ENG-23', () => {
    assert.ok(existsSync(join(dir, 'dist', 'payments', 'sitemap-index.xml')));
    assert.ok(!existsSync(join(dir, 'dist', 'consumer', 'sitemap-index.xml')));
    for (const id of ['payments', 'consumer']) {
      assert.equal(
        readFileSync(join(dir, 'dist', id, 'robots.txt'), 'utf8'),
        'User-agent: *\nDisallow: /\n',
      );
      assert.ok(existsSync(join(dir, 'dist', id, '_headers')));
    }
  });

  test('TC-A02: both home pages are identical outside the version fields', () => {
    const html = {};
    for (const id of ['payments', 'consumer']) {
      const raw = readFileSync(join(dir, 'dist', id, 'index.html'), 'utf8');
      const masked = mask(raw, readJson(join(dir, 'versions', id, 'version.json')));
      assert.notEqual(masked, raw, `${id}: the page shows version fields, so masking changed it`);
      html[id] = masked;
    }
    assert.equal(html.payments, html.consumer);
  });

  test('TC-A02 can fail: a version-only difference outside the fields is caught', () => {
    const settings = readJson(join(dir, 'versions', 'payments', 'version.json'));
    const raw = readFileSync(join(dir, 'dist', 'payments', 'index.html'), 'utf8');
    const other = readFileSync(join(dir, 'dist', 'consumer', 'index.html'), 'utf8');
    const planted = raw.replace('<h1>Portfolio</h1>', '<h1>Portfolio!</h1>');
    const consumer = readJson(join(dir, 'versions', 'consumer', 'version.json'));
    assert.notEqual(mask(planted, settings), mask(other, consumer));
  });

  test('a full build removes output of a version that no longer exists', () => {
    rmSync(join(dir, 'versions', 'consumer'), { recursive: true });
    const r = buildAll(dir);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(readdirSync(join(dir, 'dist')), ['payments']);
  });
});

describe('TC-A03: shared edits reach both builds; a settings edit reaches only its own', () => {
  let dir;
  let base;
  before(() => {
    dir = makeCopy();
    const r = buildAll(dir);
    assert.equal(r.status, 0, r.out);
    base = {
      payments: tree(join(dir, 'dist', 'payments')),
      consumer: tree(join(dir, 'dist', 'consumer')),
    };
  });

  test('editing a shared file changes both builds', () => {
    const page = join(dir, 'src', 'pages', 'index.astro');
    const original = readFileSync(page, 'utf8');
    writeFileSync(page, original.replace('<h1>Portfolio</h1>', '<h1>Portfolio TC-A03</h1>'));
    const r = buildAll(dir);
    writeFileSync(page, original);
    assert.equal(r.status, 0, r.out);
    for (const id of ['payments', 'consumer']) {
      assert.notDeepEqual(tree(join(dir, 'dist', id)), base[id], `${id} should change`);
      assert.match(readFileSync(join(dir, 'dist', id, 'index.html'), 'utf8'), /Portfolio TC-A03/);
    }
  });

  test('editing payments/version.json changes only the Payments build', () => {
    const file = join(dir, 'versions', 'payments', 'version.json');
    editJson(file, (s) => ({ ...s, heroSubline: `${s.heroSubline} TC-A03` }));
    const r = buildAll(dir);
    assert.equal(r.status, 0, r.out);
    assert.notDeepEqual(tree(join(dir, 'dist', 'payments')), base.payments);
    assert.match(readFileSync(join(dir, 'dist', 'payments', 'index.html'), 'utf8'), /TC-A03/);
    assert.deepEqual(
      tree(join(dir, 'dist', 'consumer')),
      base.consumer,
      'consumer is byte-identical',
    );
  });
});

describe('TC-A04: a bad setup stops the build with its § Multi-version message', () => {
  let dir;
  before(() => {
    dir = makeCopy();
  });

  test('no version', () => {
    const r = run(dir, ['node_modules/.bin/astro', 'build']);
    assert.notEqual(r.status, 0);
    assert.match(r.out, /Pick a version: npm run build:payments, or npm run build for all\./);
    assert.ok(!existsSync(join(dir, 'dist')), 'nothing was built');
  });

  test('an unknown version', () => {
    const r = buildAll(dir, 'nope');
    assert.equal(r.status, 1);
    assert.match(r.out, /No folder versions\/nope\. Existing versions: consumer, payments\./);
    assert.ok(!existsSync(join(dir, 'dist')));
  });

  test('a missing field, before anything is built', () => {
    const file = join(dir, 'versions', 'consumer', 'version.json');
    const original = readFileSync(file, 'utf8');
    editJson(file, ({ heroSubline, ...rest }) => rest);
    const r = buildAll(dir);
    writeFileSync(file, original);
    assert.equal(r.status, 1);
    assert.match(r.out, /versions\/consumer\/version\.json: heroSubline is missing/);
    assert.ok(!existsSync(join(dir, 'dist')), 'a bad consumer file stops payments too');
  });

  test('a missing résumé stops a local build and names the fix (D89)', () => {
    const empty = mkdtempSync(join(tmpdir(), 'eng09-empty-'));
    copies.push(empty);
    writeFileSync(join(empty, 'names.txt'), 'Zorvath Quell\n');
    const r = run(dir, ['node', 'scripts/build-all.mjs', 'payments'], {
      PORTFOLIO_PRIVATE_DIR: empty,
      CI: '',
    });
    assert.equal(r.status, 1);
    assert.match(r.out, /no résumé for "payments" at .*resumes[\\/]payments\.pdf/);
    assert.match(r.out, /npm run resume:prepare/);
  });

  test('CI with no private folder builds a stub résumé and verify:ci passes (D90)', () => {
    const home = mkdtempSync(join(tmpdir(), 'eng09-home-'));
    copies.push(home);
    const d = makeCopy();
    const r = run(d, ['node', 'scripts/build-all.mjs', 'payments'], {
      HOME: home,
      PORTFOLIO_PRIVATE_DIR: '',
      CI: 'true',
      VERIFY_MODE: 'ci',
    });
    assert.equal(r.status, 0, r.out);
    const pdf = readFileSync(join(d, 'dist', 'payments', 'Aditya-Gupta-Resume.pdf'), 'latin1');
    assert.match(pdf, /CI stub, not a resume/);
  });
});

describe('review fixes: no link and no misnamed folder gets through', () => {
  test('a link in public/ stops the build (its target could be a private file)', () => {
    const dir = makeCopy();
    const secret = join(dir, 'secret.txt');
    writeFileSync(secret, 'PRIVATE');
    symlinkSync(secret, join(dir, 'public', 'notes.txt'));
    const r = buildAll(dir, 'payments');
    assert.equal(r.status, 1);
    assert.match(r.out, /public\/notes\.txt: links are not allowed in public\/; copy the file in/);
    assert.ok(!existsSync(join(dir, 'dist')), 'nothing was built');
  });

  test('a misnamed version folder stops the full build', () => {
    const dir = makeCopy();
    cpSync(join(dir, 'versions', 'payments'), join(dir, 'versions', 'Fintech'), {
      recursive: true,
    });
    const r = buildAll(dir);
    assert.equal(r.status, 1);
    assert.match(
      r.out,
      /versions\/Fintech: a version folder name must use only a-z, 0-9 and hyphens/,
    );
    assert.ok(!existsSync(join(dir, 'dist')));
  });
});

describe('TC-A05: an extra unknown field stops the build', () => {
  test('no silent extras', () => {
    const dir = makeCopy();
    editJson(join(dir, 'versions', 'payments', 'version.json'), (s) => ({ ...s, phone: '000' }));
    const r = buildAll(dir);
    assert.equal(r.status, 1);
    assert.match(r.out, /versions\/payments\/version\.json: phone is not a known field/);
    assert.ok(!existsSync(join(dir, 'dist')));
  });
});

describe('the verify gate can fail (past mistake: a gate that fails silently)', () => {
  test('a failing verify step stops the run with a non-zero exit', () => {
    const dir = makeCopy();
    writeFileSync(
      join(dir, 'scripts', 'verify', 'index.mjs'),
      "console.error('verify: planted failure'); process.exit(1);\n",
    );
    const r = buildAll(dir);
    assert.equal(r.status, 1);
    assert.match(r.out, /verify: planted failure/);
    assert.match(r.out, /build stopped: consumer failed at "verify"\. Nothing after it ran\./);
    assert.ok(!existsSync(join(dir, 'dist', 'payments')), 'the next version was not built');
  });

  test('verify fails when there is no build folder', () => {
    const r = run(REPO, ['node', 'scripts/verify/index.mjs', 'dist/does-not-exist']);
    assert.equal(r.status, 1);
    assert.match(r.out, /verify: no build folder at dist\/does-not-exist/);
  });
});
