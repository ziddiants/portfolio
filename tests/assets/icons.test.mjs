// TC-E11 (automatic half): icon files exist at every listed size, the ICO is valid, the manifest is
// valid, the total stays inside the 30 KB budget and no file carries metadata.
// The manual half (tab icon, home-screen icon on a phone) is Aditya's check.
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { buildIco, buildIcons, ICO_SIZES } from '../../scripts/assets/icons.mjs';
import { phonesIn } from '../../scripts/verify/rules/vf-01.mjs';
import { markSvg } from '../../scripts/assets/mark.mjs';
import { dirtyPng, metadataChunks, read, repoPath } from './helpers.mjs';

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

  test('no icon PNG carries metadata', () => {
    for (const f of Object.keys(PNGS)) expect(metadataChunks(read(`public/${f}`)), f).toEqual([]);
  });

  test('the committed files equal a fresh build (nothing hand-edited, nothing stale)', async () => {
    const fresh = await buildIcons();
    for (const f of ['favicon.svg', 'site.webmanifest']) {
      expect(read(`public/${f}`).toString(), f).toBe(fresh[f]);
    }
    for (const [f, size] of Object.entries(PNGS)) {
      const meta = await sharp(fresh[f]).metadata();
      expect(meta.width, f).toBe(size);
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
  test('the metadata check rejects a PNG with EXIF', async () => {
    expect(metadataChunks(await dirtyPng()).length).toBeGreaterThan(0);
  });

  test('the ICO reader sees a two-entry file as two entries, not three', async () => {
    const png = (size) =>
      sharp({ create: { width: size, height: size, channels: 3, background: '#fff' } })
        .png()
        .toBuffer();
    const ico = buildIco([
      { size: 16, data: await png(16) },
      { size: 32, data: await png(32) },
    ]);
    const entries = await readIco(ico);
    expect(entries.map((e) => e.width)).toEqual([16, 32]);
    expect(entries.map((e) => e.width)).not.toEqual(ICO_SIZES);
  });
});
