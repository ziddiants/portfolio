// Shared helpers for the verify tests. Everything is built in temp folders and deleted at the end.
// Fake secrets, phone numbers and private files are made at test time and never written into the
// repo, so the repo's own scans (and GitHub push protection) stay clean, and no real number or
// name can reach the public repo (ENG-07 plan review C1).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll } from 'vitest';
import { writeManifest } from '../../versions/resume.mjs';

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
  privateDir: null,
  ...extra,
});

/** A new empty temp folder, deleted at the end. */
export function tempDir(prefix = 'verify-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/**
 * A fake private folder (VF-06 forbids a tracked names.txt, so it is made here). It also holds a
 * clean résumé for each test version in resumes/<id>.pdf (D89), unless `files` gives one.
 */
export function fakePrivate(files = {}) {
  const dir = tempDir('verify-private-');
  const resumes = Object.fromEntries(
    ['alpha', 'beta', 'payments', 'consumer'].map((id) => [
      `resumes/${id}.pdf`,
      makePdf({ text: `The ${id} résumé of Aditya Gupta, 46%` }),
    ]),
  );
  writeFiles(dir, { ...resumes, ...files });
  writeManifest(dir, ['alpha', 'beta', 'payments', 'consumer']); // the build ships only these (D89)
  return dir;
}

/** A temp build folder: a fixture folder copied in, plus extra files (path → text or Buffer). */
export function buildDir(fixture = null, extra = {}) {
  const dir = tempDir('verify-dist-');
  if (fixture) cpSync(fixture, dir, { recursive: true });
  writeFiles(dir, extra);
  return dir;
}

/** A made-up Indian mobile number (10 digits, first 6-9). Random each run, never stored. */
export function fakePhone() {
  const digits = [...randomBytes(9)].map((b) => b % 10).join('');
  return `${6 + (randomBytes(1)[0] % 4)}${digits}`;
}

/** A test version's settings and folder. `dir` holds its preview image (the résumé is private). */
export function fakeVersion(id, overrides = {}) {
  const dir = tempDir(`verify-version-${id}-`);
  writeFiles(dir, {
    'og.png': `fake png for ${id}`,
    'version.json': '{}',
  });
  return {
    id,
    siteUrl: `https://${id}-test.pages.dev`,
    pagesProject: `${id}-test`,
    pageTitle: `${id} title`,
    heroSubline: `Product Manager · ${id} apps & monetization`,
    carinfoBullets: [`Led the ${id} checkout rebuild across six squads`],
    ogImage: 'og.png',
    indexable: id === 'alpha',
    analyticsToken: 'test',
    approvedNumbers: ['46%'],
    dir,
    ...overrides,
  };
}

/** A context for a rule that reads a build: this version is alpha, the other is beta. */
export function siteCtx(distDir, extra = {}) {
  const version = extra.version ?? fakeVersion('alpha');
  return {
    root: extra.root ?? tempDir('verify-root-'),
    distDir,
    mode: 'local',
    staged: null,
    privateDir: null,
    others: [fakeVersion('beta')],
    ...extra,
    version,
  };
}

/**
 * A small, valid PDF made by hand: Helvetica text (ASCII only; a form feed "\f" starts a new
 * page), an Info dictionary (Author, Creator, any custom key, …) and, if asked: a catalog XMP
 * stream (`xmp`), a catalog metadata stream with any content (`metadata`), an XMP stream on the
 * page (`pageXmp`), link annotations on page 1 (`links`, a list of URIs), other annotations on
 * page 1 (`annots`, raw dictionaries) and extra catalog entries (`catalog`, raw text).
 * pdftotext and pdfinfo read it.
 */
export function makePdf({
  text = 'Aditya Gupta, product manager',
  info = {},
  xmp = null,
  metadata = null,
  pageXmp = null,
  links = [],
  annots = [],
  catalog = '',
  image = false,
  content = '',
  trailer = '',
} = {}) {
  const esc = (s) => s.replace(/([\\()])/g, '\\$1');
  const contentOf = (pageText) =>
    `BT /F1 11 Tf 14 TL 72 720 Td ${pageText
      .split('\n')
      .map((l) => `(${esc(l)}) Tj T*`)
      .join(' ')} ET`;
  const [first, ...more] = text.split('\f');
  const stream = (dict, body) => `<< ${dict} /Length ${body.length} >>\nstream\n${body}\nendstream`;
  const catalogMeta = xmp ?? metadata;
  const pageDict = (contents, extra = '', xobject = '') =>
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >>' +
    `${xobject} >> /Contents ${contents} 0 R${extra} >>`;
  // Objects 1–7 are fixed; annotations follow as 8, 9, …; then one page and its content per
  // extra page; then, with `image`, one 1×1 grey image drawn on page 1.
  const annotDicts = [
    ...links.map(
      (uri) =>
        `<< /Type /Annot /Subtype /Link /Rect [72 700 200 720] /A << /S /URI /URI (${esc(uri)}) >> >>`,
    ),
    ...annots,
  ];
  const annotRefs = annotDicts.map((_, i) => `${8 + i} 0 R`).join(' ');
  const firstExtra = 8 + annotDicts.length;
  const extraPages = more.flatMap((t, i) => [
    pageDict(firstExtra + 2 * i + 1),
    stream('', contentOf(t)),
  ]);
  const kids = ['3 0 R', ...more.map((_, i) => `${firstExtra + 2 * i} 0 R`)];
  const imageObj = firstExtra + 2 * more.length;
  const drawImage = image ? ' q 10 0 0 10 72 600 cm /Im1 Do Q' : '';
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R${catalogMeta !== null ? ' /Metadata 6 0 R' : ''}${catalog ? ` ${catalog}` : ''} >>`,
    `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`,
    pageDict(
      5,
      `${pageXmp ? ' /Metadata 6 0 R' : ''}${annotDicts.length ? ` /Annots [${annotRefs}]` : ''}`,
      image ? ` /XObject << /Im1 ${imageObj} 0 R >>` : '',
    ),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    stream('', `${contentOf(first)}${drawImage}${content ? ` ${content}` : ''}`),
    catalogMeta !== null || pageXmp
      ? stream('/Type /Metadata /Subtype /XML', catalogMeta ?? pageXmp)
      : '<< >>',
    `<< ${Object.entries(info)
      .map(([k, v]) => `/${k} (${esc(v)})`)
      .join(' ')} >>`,
    ...annotDicts,
    ...extraPages,
    ...(image
      ? [
          // `image` is true (a raw grey pixel) or the bytes of a JPEG (stored as DCTDecode).
          Buffer.isBuffer(image)
            ? stream(
                '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode',
                image.toString('latin1'),
              )
            : stream(
                '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8',
                '\x80',
              ),
        ]
      : []),
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R${trailer ? ` ${trailer}` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Findings as sorted "check file" lines: an exact, readable thing to assert. */
export const ids = (findings) => findings.map((f) => `${f.check} ${f.file ?? ''}`.trim()).sort();
