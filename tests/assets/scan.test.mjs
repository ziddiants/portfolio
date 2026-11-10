// TC-G04 (automatic half): the scanner finds font requests and images without a size, passes a clean
// build, and fails on an empty folder. The real build is scanned by `npm run build` + the CLI (PR notes).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { scanBuilt } from '../../scripts/assets/scan-built.mjs';

const dirs = [];
function site(files) {
  const dir = mkdtempSync(join(tmpdir(), 'eng11-scan-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const page = (body, head = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
const good = page('<img src="/a.png" width="590" height="1316" alt="x"><p>text</p>');

describe('scanBuilt', () => {
  test('a clean page with a sized image passes and counts the image', () => {
    const r = scanBuilt(site({ 'index.html': good, 'style.css': 'body{font-family:system-ui}' }));
    expect(r.problems).toEqual([]);
    expect(r.imageCount).toBe(1);
  });

  test('a page with no image passes, with a count of 0 (the real build today)', () => {
    const r = scanBuilt(site({ 'index.html': page('<p>hi</p>') }));
    expect(r).toMatchObject({ problems: [], imageCount: 0 });
  });

  test.each([
    ['missing height', '<img src="/a.png" width="10" alt="">', 'has no width and height'],
    ['missing width', '<img src="/a.png" height="10" alt="">', 'has no width and height'],
    ['zero size', '<img src="/a.png" width="0" height="0" alt="">', 'has no width and height'],
    [
      'percent size',
      '<img src="/a.png" width="100%" height="10" alt="">',
      'has no width and height',
    ],
  ])('an image with %s fails', (_n, img, msg) => {
    const r = scanBuilt(site({ 'index.html': page(img) }));
    expect(r.problems.join('\n')).toContain(msg);
  });

  test('a font file in the output fails', () => {
    const r = scanBuilt(site({ 'index.html': good, 'fonts/inter.woff2': 'x' }));
    expect(r.problems.join('\n')).toContain('font file shipped');
  });

  test('@font-face in a stylesheet fails', () => {
    const r = scanBuilt(
      site({ 'index.html': good, 'a.css': '@font-face{font-family:X;src:local(X)}' }),
    );
    expect(r.problems.join('\n')).toContain('@font-face');
  });

  test('url() of a font file fails, with a query string too', () => {
    const r = scanBuilt(site({ 'index.html': good, 'a.css': 'x{src:url("/f.woff2?v=3")}' }));
    expect(r.problems.join('\n')).toContain('url() of a font file');
  });

  test('a font preload fails', () => {
    const r = scanBuilt(
      site({
        'index.html': page(
          '<p>x</p>',
          '<link rel="preload" as="font" href="/f.woff2" crossorigin>',
        ),
      }),
    );
    expect(r.problems.join('\n')).toContain('preload');
  });

  test('an image inside a nested folder is found', () => {
    const r = scanBuilt(
      site({ 'index.html': good, 'case-studies/x/index.html': page('<img src="/b.png">') }),
    );
    expect(r.problems.join('\n')).toContain('case-studies/x/index.html');
  });

  test('an empty folder fails: no pages is not a pass', () => {
    expect(() => scanBuilt(site({ 'notes.txt': 'x' }))).toThrow(/no HTML file/);
  });

  test('a folder that does not exist fails', () => {
    expect(() => scanBuilt(join(tmpdir(), 'eng11-does-not-exist'))).toThrow();
  });
});

describe('scanBuilt: other ways to ask for a font (ENG-11 review, finding 8)', () => {
  const problems = (files) => scanBuilt(site({ 'index.html': good, ...files })).problems.join('\n');

  test('a Google Fonts stylesheet link fails', () => {
    const r = scanBuilt(
      site({
        'index.html': page(
          '<p>x</p>',
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
        ),
      }),
    );
    expect(r.problems.join('\n')).toContain('a font host');
  });

  test('an @import of a font host in a stylesheet fails', () => {
    expect(problems({ 'a.css': '@import url(https://fonts.gstatic.com/x.css);' })).toContain(
      'a font host',
    );
  });

  test('a preload with several rel words and an upper-case as="FONT" fails', () => {
    const head = '<link rel="Preload prefetch" as="FONT" href="/f">';
    const r = scanBuilt(site({ 'index.html': page('<p>x</p>', head) }));
    expect(r.problems.join('\n')).toContain('preload');
  });

  test('a FontFace() call in a script fails', () => {
    expect(problems({ 'app.js': 'new FontFace("X", "url(x)").load();' })).toContain('FontFace()');
  });

  test('an @font-face inside an SVG fails', () => {
    expect(
      problems({ 'logo.svg': '<svg><style>@font-face{font-family:X}</style></svg>' }),
    ).toContain('@font-face');
  });

  test('a stylesheet with an upper-case extension is still read', () => {
    expect(problems({ 'A.CSS': '@font-face{font-family:X}' })).toContain('@font-face');
  });

  test('a symbolic link in the build folder fails, it is not followed or skipped', () => {
    const dir = site({ 'index.html': good });
    symlinkSync(tmpdir(), join(dir, 'link-to-elsewhere'));
    expect(() => scanBuilt(dir)).toThrow(/symbolic link/);
  });
});

describe('the scan runs on every real build (ENG-11 review, finding 2)', () => {
  // Nothing else calls the scanner, so TC-G04 would only ever run on fixtures. build-all.mjs runs it
  // after verify, for each version, and its failure stops the build; CI runs `npm run build`.
  const src = readFileSync(new URL('../../scripts/build-all.mjs', import.meta.url), 'utf8');

  test('build-all runs scan-built.mjs on dist/<id>, after the verify step', () => {
    const verifyAt = src.indexOf("run('verify'");
    const scanAt = src.indexOf("'scan-built.mjs'");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(scanAt).toBeGreaterThan(verifyAt);
    expect(src.slice(scanAt, scanAt + 120)).toContain('dist/${id}');
  });
});
