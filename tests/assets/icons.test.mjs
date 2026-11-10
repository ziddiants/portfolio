// TC-E11 (automatic half): icon files exist at every listed size, the ICO is valid, the manifest is
// valid, the total stays inside the 30 KB budget and no file carries metadata.
// The manual half (tab icon, home-screen icon on a phone) is Aditya's check.
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { buildIco, buildIcons, ICO_SIZES } from '../../scripts/assets/icons.mjs';
import { phonesIn } from '../../scripts/verify/rules/vf-01.mjs';
import { markSvg } from '../../scripts/assets/mark.mjs';
import { dirtyPng, icoPayloads, pngProblems, read, repoPath, withChunk } from './helpers.mjs';

/** Mean absolute difference per channel of two images, or Infinity if the sizes differ. */
async function pixelDiff(a, b) {
  const raw = (x) => sharp(x).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const [A, B] = await Promise.all([raw(a), raw(b)]);
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) return Infinity;
  let sum = 0;
  for (let i = 0; i < A.data.length; i++) sum += Math.abs(A.data[i] - B.data[i]);
  return sum / A.data.length;
}

const PNGS = {
  'apple-touch-icon.png': 180,
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
};
const ALL = ['favicon.svg', 'favicon.ico', 'site.webmanifest', ...Object.keys(PNGS)];

/** Parses an ICO file back: entry sizes and the decoded PNG size of each payload. */
async function readIco(buf) {
  expect(buf.readUInt16LE(0)).toBe(0); // reserved
  expect(buf.readUInt16LE(2)).toBe(1); // icon type
  const count = buf.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    const data = buf.subarray(offset, offset + size);
    const meta = await sharp(data).metadata();
    entries.push({
      declared: buf.readUInt8(at),
      width: meta.width,
      height: meta.height,
      format: meta.format,
    });
  }
  return entries;
}

describe('icon files in public/ (TC-E11)', () => {
  test('every listed file exists', () => {
    for (const f of ALL) expect(statSync(repoPath('public', f)).size, f).toBeGreaterThan(0);
  });

  test.each(Object.entries(PNGS))('%s is %i × %i px', async (file, size) => {
    const meta = await sharp(read(`public/${file}`)).metadata();
    expect([meta.width, meta.height]).toEqual([size, size]);
  });

  test('favicon.ico holds 16, 32 and 48 px PNG images, each as declared', async () => {
    const entries = await readIco(read('public/favicon.ico'));
    expect(entries.map((e) => e.width)).toEqual(ICO_SIZES);
    for (const e of entries) {
      expect(e.format).toBe('png');
      expect(e.height).toBe(e.width);
      expect(e.declared).toBe(e.width);
    }
  });

  test('favicon.svg is the mark, drawn as paths with no <text> and no font', () => {
    const svg = read('public/favicon.svg').toString();
    expect(svg).toBe(markSvg({ rounded: true }));
    expect(svg).not.toMatch(/<text|font-family|<image/);
  });

  test('the manifest is valid JSON with 192 and 512 icons, a maskable icon and no version text', () => {
    const raw = read('public/site.webmanifest').toString();
    const m = JSON.parse(raw);
    expect(m.name).toBe('Aditya Gupta');
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons)
      expect(statSync(repoPath('public', i.src.replace(/^\//, ''))).isFile()).toBe(true);
    expect(raw).not.toMatch(/payments|consumer/i); // the file is shared by both versions (V3)
  });

  test('the icon files together stay at or under 30 KB (budget)', () => {
    const total = ALL.reduce((sum, f) => sum + statSync(repoPath('public', f)).size, 0);
    expect(total).toBeLessThanOrEqual(30 * 1024);
  });

  test('no icon PNG, and no image inside the ICO, carries anything but picture chunks', () => {
    for (const f of Object.keys(PNGS)) expect(pngProblems(read(`public/${f}`)), f).toEqual([]);
    const payloads = icoPayloads(read('public/favicon.ico'));
    expect(payloads).toHaveLength(ICO_SIZES.length);
    payloads.forEach((p, k) => expect(pngProblems(p), `favicon.ico entry ${k}`).toEqual([]));
  });

  test('the committed icons match a fresh build: same text, same pixels (nothing hand-edited, nothing stale)', async () => {
    const fresh = await buildIcons();
    for (const f of ['favicon.svg', 'site.webmanifest']) {
      expect(read(`public/${f}`).toString(), f).toBe(fresh[f]);
    }
    // PNG bytes can differ between machines (zlib, libvips), so compare the decoded pixels
    for (const f of Object.keys(PNGS)) {
      expect(await pixelDiff(read(`public/${f}`), fresh[f]), f).toBeLessThanOrEqual(1);
    }
    const kept = icoPayloads(read('public/favicon.ico'));
    const made = icoPayloads(fresh['favicon.ico']);
    expect(kept).toHaveLength(made.length);
    for (let k = 0; k < kept.length; k++) {
      expect(await pixelDiff(kept[k], made[k]), `favicon.ico entry ${k}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('VF-01 on the text files this ticket ships', () => {
  test.each(['favicon.svg', 'site.webmanifest'])(
    '%s holds nothing the phone check reads as a number',
    (f) => {
      expect(phonesIn(read(`public/${f}`).toString())).toEqual([]);
    },
  );

  test('the check does fire on digit runs like the ones that failed the build', () => {
    expect(phonesIn('<path d="A6.6 6.6 0 1 0 28.8 16"/>').length).toBeGreaterThan(0);
  });
});

describe('guards: each check fails on a bad input', () => {
  const clean = () =>
    sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .png({ palette: true })
      .toBuffer();

  test('a clean PNG passes the picture-chunk check (the check is not always red)', async () => {
    expect(pngProblems(await clean())).toEqual([]);
  });

  test('EXIF is rejected', async () => {
    expect(pngProblems(await dirtyPng()).join()).toMatch(/eXIf/);
  });

  test('a chunk nobody listed (a provenance record, caBX) is rejected', async () => {
    expect(pngProblems(withChunk(await clean(), 'caBX', Buffer.from('c2pa'))).join()).toMatch(
      /caBX/,
    );
  });

  test('a text chunk is rejected', async () => {
    expect(
      pngProblems(withChunk(await clean(), 'tEXt', Buffer.from('Author\0Some Name'))).join(),
    ).toMatch(/tEXt/);
  });

  test('bytes after IEND are rejected', async () => {
    const bad = Buffer.concat([await clean(), Buffer.from('hidden')]);
    expect(pngProblems(bad).join()).toMatch(/after the last chunk/);
  });

  test('a file that is cut short is rejected, not passed', async () => {
    const png = await clean();
    const problems = pngProblems(png.subarray(0, png.length - 5)).join();
    expect(problems).toMatch(/does not end with IEND/);
  });

  test('a chunk whose length runs past the end of the file is an error, not a pass', async () => {
    const png = await clean();
    const bad = Buffer.from(png);
    bad.writeUInt32BE(0x7fffffff, 8); // the length of the first chunk, IHDR
    expect(() => pngProblems(bad)).toThrow(/runs past the end/);
  });

  test('a file that is not a PNG is an error, not a pass', () => {
    expect(() => pngProblems(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  });

  test('the ICO reader sees a two-entry file as two entries', async () => {
    const ico = buildIco([
      { size: 16, data: await clean() },
      { size: 32, data: await clean() },
    ]);
    expect(icoPayloads(ico)).toHaveLength(2);
  });

  test('the pixel comparison tells a changed icon from an unchanged one', async () => {
    const a = read('public/icon-192.png');
    expect(await pixelDiff(a, a)).toBe(0);
    const other = await sharp(a).negate({ alpha: false }).png().toBuffer();
    expect(await pixelDiff(a, other)).toBeGreaterThan(1);
  });
});
