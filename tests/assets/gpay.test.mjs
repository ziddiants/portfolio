// Google Pay screenshots (DS-IMG, D95): the committed, optimised files meet the budgets, carry no
// metadata, have no phone frame (DR-I2) and know their size. The optimiser rejects a wrong input.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, test } from 'vitest';
import { GPAY_FILES, GpayError, optimiseGpay } from '../../scripts/assets/gpay.mjs';
import { pngProblems, read, repoPath } from './helpers.mjs';

// Screen height inside the frame, less 1 px of inset at the top and at the bottom.
const HEIGHTS = { 'gpay-processing': 1316, 'gpay-refund-pending': 1316, 'gpay-overdue': 1953 };

const tmp = mkdtempSync(join(tmpdir(), 'eng11-gpay-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('src/assets/gpay/ (committed outputs)', () => {
  test('there are exactly the three figures the content pack lists', () => {
    expect(GPAY_FILES).toEqual(['gpay-processing', 'gpay-refund-pending', 'gpay-overdue']);
    for (const n of GPAY_FILES)
      expect(existsSync(repoPath('src/assets/gpay', `${n}.png`)), n).toBe(true);
  });

  test.each(GPAY_FILES)('%s is at most 150 KB and at most 590 px wide (no upscale)', async (n) => {
    const buf = read(`src/assets/gpay/${n}.png`);
    expect(buf.length).toBeLessThanOrEqual(150 * 1024);
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(590);
    expect(meta.height).toBe(HEIGHTS[n]); // the crop of a 1390 px source is 1316, of the joined 2027 px image 1953
  });

  test.each(GPAY_FILES)('%s as WebP at its own width is at most 80 KB (ERD budget)', async (n) => {
    const webp = await sharp(read(`src/assets/gpay/${n}.png`))
      .webp({ quality: 80 })
      .toBuffer();
    expect(webp.length).toBeLessThanOrEqual(80 * 1024);
  });

  test.each(GPAY_FILES)('%s has no metadata chunk and no colour profile', async (n) => {
    const buf = read(`src/assets/gpay/${n}.png`);
    expect(pngProblems(buf)).toEqual([]);
    const meta = await sharp(buf).metadata();
    expect(meta.icc).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });

  test.each(GPAY_FILES)(
    '%s has no phone frame: corners are transparent, edges are not dark',
    async (n) => {
      const { data, info } = await sharp(read(`src/assets/gpay/${n}.png`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const px = (x, y) =>
        Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4));
      const w = info.width;
      const h = info.height;
      for (const [x, y] of [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
      ])
        expect(px(x, y)[3], `corner ${x},${y}`).toBe(0);
      expect(px(w >> 1, h >> 1)[3]).toBe(255);
      // the frame is near-black. Mid-height, the first and last opaque columns must be light.
      for (const x of [1, w - 2]) {
        const [r, g, b, a] = px(x, h >> 1);
        expect(a).toBe(255);
        expect((r + g + b) / 3, `edge column ${x}`).toBeGreaterThan(200);
      }
    },
  );
});

describe('optimiseGpay guards', () => {
  test('a screenshot of the wrong size is refused, not cropped to a guess', async () => {
    const bad = join(tmp, 'wrong-size.png');
    writeFileSync(
      bad,
      await sharp({ create: { width: 400, height: 800, channels: 3, background: '#fff' } })
        .png()
        .toBuffer(),
    );
    await expect(optimiseGpay(bad)).rejects.toThrow(GpayError);
  });

  test('a missing input file is an error, not an empty output', async () => {
    await expect(optimiseGpay(join(tmp, 'nope.png'))).rejects.toThrow();
  });

  test.skipIf(!existsSync(repoPath('.inputs/gpay/gpay-processing.png')))(
    'on the real inputs, a fresh run gives the same pixels as the committed files',
    async () => {
      for (const n of GPAY_FILES) {
        const fresh = await optimiseGpay(repoPath(`.inputs/gpay/${n}.png`));
        const a = await sharp(fresh).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const b = await sharp(read(`src/assets/gpay/${n}.png`))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect([a.info.width, a.info.height], n).toEqual([b.info.width, b.info.height]);
        let sum = 0;
        for (let q = 0; q < a.data.length; q++) sum += Math.abs(a.data[q] - b.data[q]);
        expect(sum / a.data.length, `${n}: mean pixel difference`).toBeLessThanOrEqual(1);
      }
    },
  );
});
