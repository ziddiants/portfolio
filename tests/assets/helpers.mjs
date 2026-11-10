// Shared helpers for the ENG-11 asset tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));
export const repoPath = (...p) =>
  fileURLToPath(new URL(['../..', ...p].join('/'), import.meta.url));
export const read = (rel) => readFileSync(repoPath(rel));

/** Chunk types of a PNG file, in order. Throws on a file that is not a PNG. */
export function pngChunkTypes(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG');
  const types = [];
  for (let i = 8; i + 8 <= buf.length;) {
    const len = buf.readUInt32BE(i);
    types.push(buf.toString('latin1', i + 4, i + 8));
    i += 12 + len;
  }
  return types;
}

/** Chunks that can carry names, paths, colour profiles or tool data. */
export const METADATA_CHUNKS = [
  'tEXt',
  'zTXt',
  'iTXt',
  'eXIf',
  'iCCP',
  'tIME',
  'sRGB',
  'gAMA',
  'cHRM',
];

/** The metadata chunks found in a PNG buffer (empty list = clean). */
export const metadataChunks = (buf) =>
  pngChunkTypes(buf).filter((t) => METADATA_CHUNKS.includes(t));

/** A PNG that carries EXIF and a profile: the bad case the metadata guard must reject. */
export const dirtyPng = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
    .withMetadata({ exif: { IFD0: { Copyright: 'Some Name' } } })
    .png()
    .toBuffer();
