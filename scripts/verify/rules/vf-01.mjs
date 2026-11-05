// VF-01: phone numbers (ENG-07, N7). No phone number may appear in any page, text file or PDF of
// a build, the résumé included. A finding never prints the number: CI logs of this public repo
// are public, so it shows only the last two digits.
import { pdfFiles, pdfInfo, pdfText, pdfUrls } from '../lib/pdf.mjs';
import { attrValues, binaryFiles, blocks, pages, textFiles } from '../lib/site.mjs';
import { fold } from '../lib/text.mjs';

// A digit run with the separators a phone number uses (spaces, dots, dashes, brackets). A digit
// right before it, or a letter or digit right after it, means it is part of a longer token such
// as an asset hash. A letter before it is allowed: "Mob9123456780" is still a number.
const CANDIDATE = /(?<!\p{N})(?:\+|00)?\(?\+?\d[\d ().-]{6,}\d(?![\p{L}\p{N}])/gu;

/**
 * Text as a phone scan reads it: format characters (zero-width space, soft hyphen) removed, then
 * folded, so line breaks, every kind of space and every dash become one form (review finding F5).
 */
const clean = (s) => fold(s.replace(/\p{Cf}/gu, ''));
const INDIAN = /^(?:91|0)?[6-9]\d{9}$/;
const NANP = /^\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}$/;

/** What kind of phone number a candidate is, or null. */
export function phoneKind(raw) {
  const digits = raw.replace(/\D/g, '');
  if (INDIAN.test(digits)) return 'an Indian mobile number';
  // Two numbers side by side ("98765 43210 91234 56789"): try each run of digit groups.
  const groups = raw.split(/\D+/).filter(Boolean);
  for (let i = 0; i < groups.length; i++) {
    let joined = '';
    for (let j = i; j < groups.length && joined.length < 12; j++) {
      joined += groups[j];
      if (INDIAN.test(joined)) return 'an Indian mobile number';
    }
  }
  if (/^\s*(\+|\(\+|00)/.test(raw) && digits.length >= 8 && digits.length <= 15) {
    return 'a phone number';
  }
  if (NANP.test(raw.trim())) return 'a phone number';
  return null;
}

const mask = (raw) => raw.replace(/\d(?=(?:\D*\d){2})/g, '•');

/**
 * Every phone number and tel: link in a text, as { key, message }. The message shows only the
 * last two digits. The PDF pipeline (scripts/pdf/, ENG-08) uses it too.
 */
export function phonesIn(raw) {
  const text = clean(raw);
  const out = [];
  for (const m of text.matchAll(CANDIDATE)) {
    const kind = phoneKind(m[0]);
    const key = m[0].replace(/\D/g, '').slice(-10);
    if (kind) out.push({ key, message: `holds ${kind} (${mask(m[0].trim())})` });
  }
  if (/\btel:/i.test(text)) out.push({ key: 'tel:', message: 'holds a tel: link' });
  return out;
}

function scan(file, raw, out) {
  for (const f of phonesIn(raw)) out.push({ file, ...f });
}

export default {
  id: 'VF-01',
  title: 'Phone numbers',
  checks: ['phone'],
  needsPrivate: false,
  pendable: false, // a privacy rule: never on the pending list
  run(ctx) {
    const found = [];
    for (const { file, text } of [...textFiles(ctx), ...binaryFiles(ctx)]) scan(file, text, found);
    for (const page of pages(ctx)) {
      const pieces = blocks(page.doc);
      for (const s of [...pieces, ...attrValues(page.doc)]) scan(page.file, s, found);
      // A number split across table cells or inline blocks reads as one in the joined text.
      scan(page.file, pieces.join(' '), found);
    }
    for (const file of pdfFiles(ctx)) {
      scan(file, pdfText(ctx, file), found);
      // Title and Producer are free text that VF-04 does not limit; links can be tel: or wa.me.
      scan(file, Object.values(pdfInfo(ctx, file)).join('\n'), found);
      scan(file, pdfUrls(ctx, file).join('\n'), found);
    }
    // One finding per number per file: the raw and the decoded text can both hold it.
    const seen = new Set();
    return found
      .filter((f) => !seen.has(`${f.file}|${f.key}`) && seen.add(`${f.file}|${f.key}`))
      .map(({ file, message }) => ({
        check: 'phone',
        file,
        message,
        fix: 'remove the number from the source of this file: no phone number may appear (N7)',
      }));
  },
};
