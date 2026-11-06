// Where a version's résumé comes from (D89, D90). The real file lives in the private vault, never
// in git: private/resumes/<id>.pdf, made by `npm run resume:prepare`. One function finds it, so
// load.mjs, assemble-public.mjs and verify never build that path themselves.
//
// CI has no private folder. There (CI=true and no real file) the build gets a stub résumé: a
// valid PDF with no phone number and no figures. A local build never gets a stub.
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { privateDir as defaultPrivateDir } from '../scripts/verify/lib/private.mjs';

export const STUB_MARKER = 'CI stub, not a resume';

/** The path of a version's clean résumé in the private folder. */
export const resumePath = (id, privateDir = defaultPrivateDir()) =>
  join(privateDir, 'resumes', `${id}.pdf`);

/**
 * { kind: 'real', path } or { kind: 'stub' }. A link or a folder is refused: a symlink could pull
 * any file into the build. Throws Error with the fix line when a local build has no résumé.
 */
export function resolveResume(id, { privateDir = defaultPrivateDir(), env = process.env } = {}) {
  const path = resumePath(id, privateDir);
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry) {
    if (!entry.isFile()) throw new Error(`${path} must be a real file, not a link or a folder`);
    return { kind: 'real', path };
  }
  if (env.CI === 'true') return { kind: 'stub' };
  throw new Error(
    `no résumé for "${id}" at ${path}. Put the raw PDF in ${join(privateDir, 'resumes', 'raw', `${id}.pdf`)} ` +
      'and run: npm run resume:prepare',
  );
}

/** A one-page PDF that says what it is. No phone number, no figure, no metadata (CI build). */
export function stubResumePdf(extraLines = []) {
  // Long enough to pass the readable-text floor of the PDF scans (ERD § Assets, step 3).
  const lines = [
    `${STUB_MARKER}.`,
    'This file stands in for the real resume in a CI build.',
    'Only a local build with the private folder holds the real file.',
    ...extraLines, // tests add a line with a figure
  ];
  const text = lines.map((l, i) => `${i ? '0 -24 Td ' : ''}(${l}) Tj`).join(' ');
  const content = `BT /F1 14 Tf 72 720 Td ${text} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
