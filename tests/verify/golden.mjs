// The passing sample for the ENG-07 rules: one complete site (tests/fixtures/verify/site-pass/)
// with a fixture source root (tests/fixtures/verify/root/). Each failing case copies it and plants
// one fault, so a test proves the rule catches exactly that fault.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDir, fakePrivate, fakeVersion, makePdf, siteCtx } from './helpers.mjs';

export const SITE = fileURLToPath(new URL('../fixtures/verify/site-pass', import.meta.url));
export const ROOT = fileURLToPath(new URL('../fixtures/verify/root', import.meta.url));
export const APPROVED = ['46%', '67%', '16%', '₹2.5L'];

/** A résumé PDF that holds every approved number ("Rs 2.5L" is read as ₹2.5L). */
export const resumePdf = (extra = {}) =>
  makePdf({
    text: 'Aditya Gupta\nPayment success 46% to 67%, revenue +16%, about Rs 2.5L a month',
    info: { Title: 'Aditya Gupta', Author: 'Aditya Gupta' },
    ...extra,
  });

/** Fake private files: made-up names and a source register for the fixture IDs. */
export const privateFiles = () => ({
  'names.txt': '# made-up test names, never real ones\nZorvath Quell\nBaaroon Operators\n',
  'content-sources.md': '| ID | Source |\n| --- | --- |\n| S-003 | test |\n| S-012 | test |\n',
});

/**
 * A context on a fresh copy of the golden site. `files` adds or replaces files in the build;
 * `edit` maps a build path to a function that rewrites that file's text.
 */
export function golden({ files = {}, edit = {}, ...extra } = {}) {
  const dist = buildDir(SITE, { 'Aditya-Gupta-Resume.pdf': resumePdf(), ...files });
  for (const [path, change] of Object.entries(edit)) {
    const p = join(dist, path);
    const before = readFileSync(p, 'utf8');
    const after = change(before);
    // An edit that matches nothing plants no fault, and its test would prove nothing.
    if (after === before) throw new Error(`the test edit did not change ${path}`);
    writeFileSync(p, after);
  }
  return siteCtx(dist, {
    root: ROOT,
    privateDir: fakePrivate(privateFiles()),
    version: fakeVersion('alpha', { approvedNumbers: APPROVED }),
    ...extra,
  });
}
