// Reads the PDFs in dist/<id>/ with poppler (pdftotext, pdfinfo) for VF-01, VF-02, VF-03, VF-04
// and VF-08. A missing tool or a file it cannot read throws, so the runner reports a failure,
// never a pass (past mistake: a scanner can exit 0 without scanning).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
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

/** The text layer, in reading order. A hyphen at a line end is joined to the next line. */
export function pdfText(ctx, file) {
  return memo(ctx, `pdftext:${file}`, () => {
    const text = tool('pdftotext', ['-enc', 'UTF-8', '-nopgbrk', abs(ctx, file), '-']);
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

/** Every URL in the PDF's objects (link annotations): a tel: link has no visible text. */
export const pdfUrls = (ctx, file) =>
  memo(ctx, `pdfurls:${file}`, () =>
    tool('pdfinfo', ['-url', abs(ctx, file)])
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/\s+/).slice(2).join(' '))
      .filter(Boolean),
  );

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
