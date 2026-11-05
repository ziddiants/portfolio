// VF-02: teammate names and team labels (ENG-07, N9). No entry of the private names list may
// appear in a page, text file or PDF (its text or its metadata). It fails closed when the list is
// missing or empty, except in CI, where it is skipped (the runner does this).
//
// Matching ignores case, accents and doubled letters, so "Baaroon" also catches "Baroon", and a
// two-word label also matches across a line break or a hyphen. A finding names the line of
// names.txt, never the name: the message must not leak what it protects.
import { privateLines } from '../lib/private.mjs';
import { pdfFiles, pdfInfo, pdfText, pdfUrls } from '../lib/pdf.mjs';
import { attrValues, binaryFiles, blocks, pages, textFiles } from '../lib/site.mjs';
import { escapeRegExp, fold } from '../lib/text.mjs';

/** The form both sides are compared in: plain lower-case letters, digits and single spaces. */
export const key = (s) =>
  fold(s)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/([a-z])\1+/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export default {
  id: 'VF-02',
  title: 'Teammate names and team labels',
  checks: ['names'],
  needsPrivate: ['names.txt'],
  pendable: false, // a privacy rule: never on the pending list
  run(ctx) {
    const lines = privateLines(ctx.privateDir, 'names.txt').map(({ text, line }) => ({
      line,
      k: key(text),
    }));
    // An entry with no Latin letter or digit (a name in another script) cannot be matched.
    // Dropping it would leave that name unchecked, so it fails closed instead.
    const unmatchable = lines
      .filter((e) => !e.k)
      .map((e) => ({
        check: 'names',
        message: `names.txt line ${e.line} has no Latin letter or digit, so it cannot be checked`,
        fix: 'write the name in Latin letters too (one spelling per line)',
      }));
    const entries = lines
      .filter((e) => e.k)
      .map(({ line, k }) => ({
        line,
        re: new RegExp(`(?<![a-z0-9])${escapeRegExp(k).replace(/ /g, ' ?')}(?![a-z0-9])`),
      }));
    if (entries.length === 0) {
      return [
        ...unmatchable,
        {
          check: 'names',
          message: 'names.txt has no entry made of letters or digits',
          fix: 'add one teammate name or team label per line',
        },
      ];
    }

    // Every file: text files, binary files (image metadata is plain bytes), pages, PDFs.
    const sources = [...textFiles(ctx), ...binaryFiles(ctx)].map(({ file, text }) => ({
      file,
      text,
    }));
    for (const page of pages(ctx)) {
      sources.push({
        file: page.file,
        text: [...blocks(page.doc), ...attrValues(page.doc)].join('\n'),
      });
    }
    for (const file of pdfFiles(ctx)) {
      sources.push({ file, text: pdfText(ctx, file) });
      sources.push({ file, text: Object.values(pdfInfo(ctx, file)).join('\n') }); // custom keys too
      sources.push({ file, text: pdfUrls(ctx, file).join('\n') });
    }

    const findings = [...unmatchable];
    const seen = new Set();
    for (const { file, text } of sources) {
      const hay = key(text);
      for (const e of entries) {
        if (!e.re.test(hay) || seen.has(`${file}|${e.line}`)) continue;
        seen.add(`${file}|${e.line}`);
        findings.push({
          check: 'names',
          file,
          message: `holds the name or label on names.txt line ${e.line}`,
          fix: 'remove it from the source of this file (for a PDF: fix and re-export the source)',
        });
      }
    }
    return findings;
  },
};
