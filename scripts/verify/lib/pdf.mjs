// Reads the PDFs in dist/<id>/ with poppler (pdftotext, pdfinfo, pdfdetach, pdfimages) for
// VF-01, VF-02, VF-03, VF-04 and VF-08, and for the cohort PDF pipeline (scripts/pdf/), which
// also reads every string object with qpdf. A missing tool or a file it cannot read throws, so
// the runner reports a failure, never a pass (past mistake: a scanner can exit 0 without
// scanning).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { inflateSync } from 'node:zlib';
import { abs, listFiles, memo } from './site.mjs';

function tool(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error?.code === 'ENOENT') {
    throw new Error(
      `${cmd} is not installed, so the PDFs cannot be checked ` +
        '(Mac: brew install poppler; CI: apt-get install poppler-utils)',
    );
  }
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${cmd} could not read ${args.at(-1)}: ${(r.stderr || '').trim()}`);
  }
  return r.stdout;
}

/**
 * Every PDF in the build. None at all is a failure: every build holds its résumé (L1), so an
 * empty list means a wrong path or a broken build.
 */
export function pdfFiles(ctx) {
  return memo(ctx, 'pdfs', () => {
    const list = listFiles(ctx).filter((f) => /\.pdf$/i.test(f));
    if (list.length === 0) {
      throw new Error(
        `no PDF in ${relative(ctx.root, ctx.distDir) || ctx.distDir}; ` +
          'every build must hold Aditya-Gupta-Resume.pdf',
      );
    }
    return list;
  });
}

// A PDF with fewer letters than this has no real text layer (an image or outlined-text export):
// the scans would read nothing and pass (review finding F1; ERD § Assets, step 3).
export const MIN_LETTERS = 20;

// pdftotext reads only text inside the page box by default. A crop area far larger than any page
// also reads text placed off the page, which no viewer shows but the file still holds (cold
// review, ENG-08). On text inside the page it gives the same output.
const ALL_AREA = ['-x', '-20000', '-y', '-20000', '-W', '40000', '-H', '40000'];

/** The text layer, in reading order. A hyphen at a line end is joined to the next line. */
export function pdfText(ctx, file) {
  return memo(ctx, `pdftext:${file}`, () => {
    const text = tool('pdftotext', ['-enc', 'UTF-8', '-nopgbrk', ...ALL_AREA, abs(ctx, file), '-']);
    const letters = (text.match(/\p{L}/gu) ?? []).length;
    if (letters < MIN_LETTERS) {
      throw new Error(
        `${file} has no readable text layer (${letters} letters), so it cannot be scanned; ` +
          'export it with real text (ERD § Assets, PDF pipeline step 3)',
      );
    }
    return text.replace(/-\n(?=\w)/g, '');
  });
}

/**
 * The text layer split into pages (index 0 is page 1), for findings that name a page. It checks
 * the text layer first, so a PDF with no text throws here too.
 */
export function pdfPages(ctx, file) {
  return memo(ctx, `pdfpages:${file}`, () => {
    pdfText(ctx, file);
    const text = tool('pdftotext', ['-enc', 'UTF-8', ...ALL_AREA, abs(ctx, file), '-']);
    return text
      .replace(/\f$/, '')
      .split('\f')
      .map((page) => page.replace(/-\n(?=\w)/g, ''));
  });
}

/** How many embedded files (attachments) the PDF holds, read with pdfdetach. */
export function pdfAttachments(ctx, file) {
  return memo(ctx, `pdfdetach:${file}`, () => {
    const first = tool('pdfdetach', ['-list', abs(ctx, file)]).split('\n')[0];
    const m = /^(\d+) embedded files?/.exec(first);
    if (!m) throw new Error(`pdfdetach printed an unknown first line for ${file}`);
    return Number(m[1]);
  });
}

/**
 * The document info fields as { key: value }, custom keys included (pdfinfo -custom). Plain
 * pdfinfo prints only "Custom Metadata: yes" for keys such as Company (review finding F2).
 */
export function pdfInfo(ctx, file) {
  return memo(ctx, `pdfinfo:${file}`, () => {
    const info = {};
    const read = (args) => {
      for (const line of tool('pdfinfo', [...args, '-enc', 'UTF-8', abs(ctx, file)]).split('\n')) {
        const m = /^([A-Za-z][A-Za-z ]*?):\s*(.*)$/.exec(line);
        if (m) info[m[1]] = m[2].trim();
      }
    };
    read([]);
    read(['-custom']);
    return info;
  });
}

/** Every link in the PDF's objects as { page, url }: a tel: link has no visible text. */
export const pdfLinks = (ctx, file) =>
  memo(ctx, `pdflinks:${file}`, () =>
    tool('pdfinfo', ['-url', abs(ctx, file)])
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/\s+/))
      .map((parts) => ({ page: Number(parts[0]), url: parts.slice(2).join(' ') }))
      .filter((l) => l.url),
  );

/**
 * The pages that hold at least one raster image, in order (pdfimages -list). A drawing made of
 * vector paths is not an image here, so this list shortens an eye check; it never replaces one.
 */
export const pdfImagePages = (ctx, file) =>
  memo(ctx, `pdfimages:${file}`, () => {
    const lines = tool('pdfimages', ['-list', abs(ctx, file)]).split('\n');
    if (!/^page\s+num\s/.test(lines[0] ?? '')) {
      throw new Error(`pdfimages printed an unknown first line for ${file}`);
    }
    const pages = lines
      .slice(2)
      .map((l) => Number(l.trim().split(/\s+/)[0]))
      .filter((n) => Number.isInteger(n) && n > 0);
    return [...new Set(pages)].sort((a, b) => a - b);
  });

/**
 * A qpdf JSON string as text. qpdf gives text as "u:…", already decoded from UTF-16 or
 * PDFDocEncoding (broken UTF-16 too); "b:…" is hex for bytes that are not text, read as Latin-1.
 */
const jsonString = (v) =>
  v.startsWith('u:') ? v.slice(2) : Buffer.from(v.slice(2), 'hex').toString('latin1');

/**
 * Every object of the PDF as qpdf JSON ({ "obj:N 0 R": { value } | { stream: { dict } }, trailer }).
 * qpdf decodes strings and #-escaped names, so "/#4Caunch" reads as "/Launch". Stream data is
 * not read. qpdf exit 3 (warnings) still gives the objects.
 */
export function pdfObjects(ctx, file) {
  return memo(ctx, `pdfobjects:${file}`, () => {
    const r = spawnSync('qpdf', ['--json-output', '--json-stream-data=none', abs(ctx, file), '-'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (r.error?.code === 'ENOENT') {
      throw new Error(
        'qpdf is not installed, so the PDF objects cannot be read (brew install qpdf)',
      );
    }
    try {
      if (r.error || ![0, 3].includes(r.status)) throw new Error();
      return JSON.parse(r.stdout).qpdf[1];
    } catch {
      throw new Error(
        `qpdf could not read the objects of ${file} (exit ${r.status ?? r.error?.code})`,
      );
    }
  });
}

/**
 * Every dictionary in the PDF's objects, nested ones too, except the trailer and the Info
 * dictionary: the pipeline replaces Info in step 6, and VF-04 checks it.
 */
export function pdfDicts(ctx, file) {
  return memo(ctx, `pdfdicts:${file}`, () => {
    const objects = pdfObjects(ctx, file);
    const info = objects.trailer?.value?.['/Info'];
    const out = [];
    const walk = (v) => {
      if (Array.isArray(v)) {
        v.forEach(walk);
      } else if (v && typeof v === 'object') {
        out.push(v);
        Object.values(v).forEach(walk);
      }
    };
    for (const [id, o] of Object.entries(objects)) {
      if (id === 'trailer' || id === `obj:${info}`) continue;
      walk(o.value ?? o.stream?.dict);
    }
    return out;
  });
}

/**
 * Every string outside the page text (bookmark titles, annotation /Contents and /T, alternate
 * text, link targets, file paths): pdftotext reads none of them. Taken from pdfDicts(), so the
 * Info dictionary is left out.
 */
const isString = (x) => typeof x === 'string' && (x.startsWith('u:') || x.startsWith('b:'));
// Strings in a value, arrays of any depth included; a dictionary is skipped here, because
// pdfDicts() lists it on its own.
const stringsIn = (v) =>
  isString(v) ? [jsonString(v)] : Array.isArray(v) ? v.flatMap(stringsIn) : [];

export const pdfStrings = (ctx, file) =>
  memo(ctx, `pdfstrings:${file}`, () =>
    pdfDicts(ctx, file).flatMap((d) => Object.values(d).flatMap(stringsIn)),
  );

// JPEG segments that carry no personal data: JFIF (APP0), an ICC colour profile (APP2), Adobe
// colour info (APP14). Any other APPn (EXIF and XMP in APP1, IPTC in APP13, …) or a comment (COM)
// can hold an owner name, a camera serial or a GPS position.
const JPEG_OK = new Set([0xe0, 0xe2, 0xee]);

/**
 * For every JPEG image the pages draw, the segments that can hold metadata, as
 * [{ page, marker }] (marker such as "APP1" or "COM"). The images are saved as they are stored
 * (pdfimages -j -p) into a temp folder and read segment by segment up to the image data.
 */
export function pdfJpegMetadata(ctx, file) {
  return memo(ctx, `pdfjpeg:${file}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-jpeg-'));
    try {
      tool('pdfimages', ['-j', '-p', abs(ctx, file), join(dir, 'img')]);
      const out = [];
      for (const name of readdirSync(dir)
        .filter((n) => n.endsWith('.jpg'))
        .sort()) {
        const page = Number(/^img-(\d+)-/.exec(name)?.[1]);
        const b = readFileSync(join(dir, name));
        if (b[0] !== 0xff || b[1] !== 0xd8) {
          throw new Error(`pdfimages wrote a JPEG without a start marker for ${file}`);
        }
        for (let i = 2; i + 3 < b.length && b[i] === 0xff;) {
          const m = b[i + 1];
          if (m === 0xda || m === 0xd9) break; // image data or end: no more metadata segments
          if ((m >= 0xe0 && m <= 0xef && !JPEG_OK.has(m)) || m === 0xfe) {
            out.push({ page, marker: m === 0xfe ? 'COM' : `APP${m - 0xe0}` });
          }
          i += 2 + b.readUInt16BE(i + 2);
        }
      }
      return out;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

/** Every URL in the PDF's objects (link annotations). */
export const pdfUrls = (ctx, file) => pdfLinks(ctx, file).map((l) => l.url);

/**
 * The file's raw bytes plus every stream that inflates, as text (one character per byte). XMP can
 * sit on any page or image object, where pdfinfo -meta never looks (review finding F2c).
 */
export function pdfRaw(ctx, file) {
  return memo(ctx, `pdfraw:${file}`, () => {
    const bytes = readFileSync(abs(ctx, file));
    const parts = [bytes.toString('latin1')];
    const raw = parts[0];
    for (const m of raw.matchAll(/stream\r?\n/g)) {
      const start = m.index + m[0].length;
      const end = raw.indexOf('endstream', start);
      if (end === -1) continue;
      try {
        parts.push(inflateSync(bytes.subarray(start, end)).toString('latin1'));
      } catch {
        // Not a Flate stream (or plain text, already in parts[0]).
      }
    }
    return parts.join('\n');
  });
}
