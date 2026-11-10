// TC-G04 (automatic half): the scanner finds font requests and images without a size, passes a clean
// build, and fails on an empty folder. The real build is scanned by `npm run build` + the CLI (PR notes).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
