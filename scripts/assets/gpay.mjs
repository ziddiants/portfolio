// Optimises the three Google Pay screenshots (DS-IMG, D95) from .inputs/gpay/ into src/assets/gpay/.
// Run by hand: `npm run assets:gpay`. The outputs are committed; the originals stay in .inputs/.
//
// What it does to each file:
// - crops the phone frame away (DR-I2: no fake phone frames; the page puts the screen on a panel),
// - rounds the screen corners with a transparent mask (the screen has rounded corners; the crop is square),
// - converts to sRGB, drops the Apple "Display" colour profile and all metadata,
// - writes a palette PNG (flat UI colours compress far below the 150 KB budget).
// Width is never raised: the sources are 662 px wide, so the output is 590 px (D95).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const GPAY_FILES = ['gpay-processing', 'gpay-refund-pending', 'gpay-overdue'];

// The screen inside the frame starts at x=36, y=34 and ends at x=627 (measured on all three files).
// Crop 1 px inside to lose the anti-aliased edge of the frame.
const INSET = { left: 37, top: 35, right: 626 }; // right = last column kept
const FRAME_BOTTOM = { 1390: 1351, 2027: 1988 }; // last screen row, by source height
const CORNER_RADIUS = 41;

export class GpayError extends Error {}

export async function optimiseGpay(inputPath) {
  const meta = await sharp(inputPath).metadata();
  const bottom = FRAME_BOTTOM[meta.height];
  if (meta.width !== 662 || bottom === undefined) {
    throw new GpayError(
      `${inputPath}: expected a 662 px wide screenshot of height 1390 or 2027, got ${meta.width} × ${meta.height}`,
    );
  }
  const width = INSET.right - INSET.left + 1;
  const height = bottom - 1 - INSET.top + 1;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" rx="${CORNER_RADIUS}" fill="#fff"/></svg>`,
  );
  return sharp(inputPath)
    .extract({ left: INSET.left, top: INSET.top, width, height })
    .toColourspace('srgb')
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ palette: true, quality: 90, effort: 10 })
    .toBuffer();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = join(ROOT, 'src', 'assets', 'gpay');
  mkdirSync(outDir, { recursive: true });
  for (const name of GPAY_FILES) {
    const data = await optimiseGpay(join(ROOT, '.inputs', 'gpay', `${name}.png`));
    const { width, height } = await sharp(data).metadata();
    writeFileSync(join(outDir, `${name}.png`), data);
    console.log(`src/assets/gpay/${name}.png  ${width} × ${height}  ${data.length} bytes`);
  }
}
