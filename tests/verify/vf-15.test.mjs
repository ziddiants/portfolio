// VF-15 tests (ENG-07, TC-B15): a 400 KB home page and a 200 KB image fail; a srcset counts its
// largest file; a file the home page loads but the build lacks fails.
import { describe, expect, test } from 'vitest';
import vf15 from '../../scripts/verify/rules/vf-15.mjs';
import { golden } from './golden.mjs';
import { ids } from './helpers.mjs';

const bytes = (n) => Buffer.alloc(n, 0x61);
const inBody = (html, files = {}) =>
  golden({ files, edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) } });

describe('VF-15 weight', () => {
  test('a 400 KB home page fails, and the message names the largest files', () => {
    const found = vf15.run(inBody(`<!-- ${'x'.repeat(400_000)} -->`));
    expect(ids(found)).toEqual(['home-weight index.html']);
    expect(found[0].message).toMatch(
      /^the home page loads \d+ bytes \(limit 300000\); largest: index\.html/,
    );
  });

  test('a 200 KB image fails anywhere in the build', () => {
    expect(ids(vf15.run(golden({ files: { 'work/big.webp': bytes(200_000) } })))).toEqual([
      'image-size work/big.webp',
    ]);
  });

  test('images, CSS and scripts on the home page add up; srcset counts its largest file', () => {
    const files = {
      'a-1.webp': bytes(140_000),
      'a-2.webp': bytes(149_000),
      'b.webp': bytes(20_000),
    };
    const html =
      '<img src="/a-1.webp" srcset="/a-1.webp 720w, /a-2.webp 1080w" alt="a"><img src="/b.webp" alt="b">';
    expect(vf15.run(inBody(html, files))).toEqual([]);
    const more = { ...files, 'c.webp': bytes(149_000) };
    const found = vf15.run(inBody(`${html}<img src="/c.webp" alt="c">`, more));
    expect(ids(found)).toEqual(['home-weight index.html']);
    expect(found[0].message).toMatch(/largest: a-2\.webp 149000, c\.webp 149000/);
  });

  test('a file the home page loads but the build lacks fails', () => {
    const found = vf15.run(inBody('<img src="/gone.png" alt="gone">'));
    expect(found[0].message).toBe('loads /gone.png, which is not in the build');
  });
});
