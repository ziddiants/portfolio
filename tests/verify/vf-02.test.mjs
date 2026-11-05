// VF-02 tests (ENG-07, TC-B02): a listed name, a spelling variant of a label and a numbered team
// label fail in pages, PDF text and PDF metadata; the list missing fails locally and is skipped
// in CI. Every name here is made up; the real list lives only in the vault (C1).
import { describe, expect, test } from 'vitest';
import vf02, { key } from '../../scripts/verify/rules/vf-02.mjs';
import { runRules } from '../../scripts/verify/runner.mjs';
import { golden, resumePdf } from './golden.mjs';
import { fakePrivate, ids, makePdf } from './helpers.mjs';

const LIST = '# made up\nKelvaro\nBaaroon Operators\nTeam 7\n';
const ctxWith = (extra = {}) =>
  golden({ privateDir: fakePrivate({ 'names.txt': LIST }), ...extra });
const inPage = (html) =>
  ctxWith({ edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) } });

describe('VF-02 teammate names and team labels', () => {
  test.each([
    ['a listed first name', '<p>Built with Kelvaro and the team.</p>', 2],
    ['a label with one vowel, not two', '<p>The Baroon Operators shipped it.</p>', 3],
    ['a label in another case, split by a tag', '<p>The <b>BAAROON</b> operators won.</p>', 3],
    ['a numbered team label', '<p>We were Team 7 in the cohort.</p>', 4],
    ['a name in an attribute', '<img src="/x.png" alt="Kelvaro at the demo">', 2],
  ])('%s fails, and the finding names the list line', (_, html, line) => {
    const found = vf02.run(inPage(html));
    expect(ids(found)).toEqual(['names index.html']);
    expect(found[0].message).toBe(`holds the name or label on names.txt line ${line}`);
  });

  test('a name in PDF text fails, also across a line break', () => {
    const pdf = resumePdf({ text: 'Aditya Gupta\nWith the Baaroon\nOperators team' });
    expect(ids(vf02.run(ctxWith({ files: { 'Aditya-Gupta-Resume.pdf': pdf } })))).toEqual([
      'names Aditya-Gupta-Resume.pdf',
    ]);
  });

  test('a name in PDF metadata fails', () => {
    const pdf = resumePdf({ info: { Author: 'Kelvaro' } });
    expect(ids(vf02.run(ctxWith({ files: { 'case-studies/Vendrax.pdf': pdf } })))).toEqual([
      'names case-studies/Vendrax.pdf',
    ]);
  });

  test('a longer word that only starts with a name passes; the golden site passes', () => {
    expect(vf02.run(inPage('<p>Kelvarovich and Team 70 are other things.</p>'))).toEqual([]);
    expect(vf02.run(ctxWith())).toEqual([]);
    expect(key('Baaroon  Operators')).toBe(key('baroon-operators'));
  });

  test('an entry with no Latin letter or digit fails closed, never drops out silently', () => {
    const privateDir = fakePrivate({ 'names.txt': 'Kelvaro\nज़ोर्वाथ\n' });
    const found = vf02.run(golden({ privateDir }));
    expect(found.map((f) => f.message)).toEqual([
      'names.txt line 2 has no Latin letter or digit, so it cannot be checked',
    ]);
  });

  test('F2: a name in a PDF link or a custom Info field fails', () => {
    const link = makePdf({ links: ['https://github.com/kelvaro'] });
    expect(ids(vf02.run(ctxWith({ files: { 'case-studies/Vendrax.pdf': link } })))).toEqual([
      'names case-studies/Vendrax.pdf',
    ]);
    const custom = makePdf({ info: { Author: 'Aditya Gupta', Manager: 'Kelvaro' } });
    expect(ids(vf02.run(ctxWith({ files: { 'case-studies/Vendrax.pdf': custom } })))).toEqual([
      'names case-studies/Vendrax.pdf',
    ]);
  });

  test('F4: a name in image metadata or a file of any type fails', () => {
    const png = Buffer.concat([
      Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'),
      Buffer.from('tEXtAuthor\0Kelvaro', 'latin1'),
    ]);
    expect(ids(vf02.run(ctxWith({ files: { 'photo.png': png } })))).toEqual(['names photo.png']);
    expect(ids(vf02.run(ctxWith({ files: { 'team.yaml': 'lead: Kelvaro\n' } })))).toEqual([
      'names team.yaml',
    ]);
  });

  test('F10: a line like "#growth-pod" is a label, not a comment; "# note" is a comment', () => {
    const privateDir = fakePrivate({ 'names.txt': '# a comment\n#growth-pod\n' });
    const ctx = golden({
      privateDir,
      edit: { 'index.html': (s) => s.replace('</body>', '<p>The growth pod won.</p></body>') },
    });
    expect(vf02.run(ctx).map((f) => f.message)).toEqual([
      'holds the name or label on names.txt line 2',
    ]);
  });

  test('the list missing: fails closed locally, "skipped" in CI', () => {
    const local = runRules([vf02], golden({ privateDir: fakePrivate({}) }));
    expect(local.findings[0].message).toMatch(/needs names\.txt .* it is missing \(fails closed\)/);
    const ci = runRules([vf02], golden({ privateDir: fakePrivate({}), mode: 'ci' }));
    expect(ci.skipped).toEqual(['VF-02']);
  });
});
