// Builds the site icons from the one mark (DS-MARK) into public/ (shared by both versions).
// Run by hand: `npm run assets:icons`. The outputs are committed.
// The files use the conventional root names, which browsers request without a <link> tag.
// The <link> and theme-color tags are added by ENG-22 (ENG-12 builds the empty head slots).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND, SITE_NAME } from './brand.mjs';
import { markSvg } from './mark.mjs';
import { isMain } from './is-main.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const ICO_SIZES = [16, 32, 48];

async function png(svg, size) {
  // density scales the vector render so the edges are drawn at the target size, not resampled
  return sharp(Buffer.from(svg), { density: (72 * size) / 32 })
    .resize(size, size)
    .png({ palette: true, effort: 10 })
    .toBuffer();
}

/** ICO container with PNG payloads: 6-byte header, 16-byte entries, then the images. */
export function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); // width (256 would be 0; we stop at 48)
    e.writeUInt8(size, 1);
    e.writeUInt8(0, 2); // palette size: none
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

export function manifestJson() {
  return (
    JSON.stringify(
      {
        name: SITE_NAME,
        short_name: SITE_NAME,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        theme_color: BRAND.bg,
        background_color: BRAND.bg,
        display: 'browser',
        start_url: '/',
      },
      null,
      2,
    ) + '\n'
  );
}

/** Returns { 'file name in public/': Buffer | string }. Writes nothing. */
export async function buildIcons() {
  const rounded = markSvg({ rounded: true });
  const bleed = markSvg({ rounded: false });
  const icoImages = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await png(rounded, size) })),
  );
  return {
    'favicon.svg': rounded,
    'favicon.ico': buildIco(icoImages),
    'apple-touch-icon.png': await png(bleed, 180),
    'icon-192.png': await png(rounded, 192),
    'icon-512.png': await png(rounded, 512),
    'icon-maskable-512.png': await png(bleed, 512),
    'site.webmanifest': manifestJson(),
  };
}

if (isMain(import.meta.url)) {
  const out = join(ROOT, 'public');
  mkdirSync(out, { recursive: true });
  const files = await buildIcons();
  for (const [name, data] of Object.entries(files)) {
    writeFileSync(join(out, name), data);
    console.log(`public/${name}  ${Buffer.byteLength(data)} bytes`);
  }
}
