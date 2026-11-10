// Shared helpers for the ENG-11 asset tests.
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));
export const repoPath = (...p) =>
  fileURLToPath(new URL(['../..', ...p].join('/'), import.meta.url));
export const read = (rel) => readFileSync(repoPath(rel));

/**
 * Chunk types of a PNG file, in order, and where the last chunk ends.
 * Throws on a file that is not a PNG, or whose chunk length runs past the end of the file.
 */
export function pngChunks(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) throw new Error('not a PNG');
  const types = [];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    if (i + 12 + len > buf.length)
      throw new Error(`PNG chunk at byte ${i} runs past the end of the file`);
    types.push(buf.toString('latin1', i + 4, i + 8));
    i += 12 + len;
  }
  return { types, end: i };
}

/**
 * Only these chunks may be in a committed image: the picture (IHDR, PLTE, tRNS, IDAT), its end (IEND)
 * and the pixel size (pHYs). Every other chunk can carry a name, a path, a tool name, a colour profile
 * or a provenance record (tEXt, zTXt, iTXt, eXIf, iCCP, tIME, caBX, ...). An allowlist, because a
 * denylist misses the chunk nobody listed.
 */
export const ALLOWED_CHUNKS = ['IHDR', 'PLTE', 'tRNS', 'pHYs', 'IDAT', 'IEND'];

/** What is wrong with a PNG buffer as a clean public image. Empty list = clean. */
export function pngProblems(buf) {
  const { types, end } = pngChunks(buf);
  const problems = types.filter((t) => !ALLOWED_CHUNKS.includes(t)).map((t) => `chunk ${t}`);
  if (types.at(-1) !== 'IEND') problems.push('does not end with IEND');
  if (end !== buf.length) problems.push(`${buf.length - end} byte(s) after the last chunk`);
  return problems;
}

/** The image payloads of an ICO file (each one a PNG here). */
export function icoPayloads(buf) {
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, k) => {
    const at = 6 + 16 * k;
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    if (offset + size > buf.length) throw new Error(`ICO entry ${k} runs past the end of the file`);
    return buf.subarray(offset, offset + size);
  });
}

/** Inserts a chunk of the given type and data before IEND, with a valid CRC. For bad-input fixtures. */
export function withChunk(png, type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)]);
}

/** A PNG that carries EXIF and a profile: the bad case the metadata guard must reject. */
export const dirtyPng = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
    .withMetadata({ exif: { IFD0: { Copyright: 'Some Name' } } })
    .png()
    .toBuffer();
