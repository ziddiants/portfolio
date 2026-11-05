// VF-04 tests (ENG-07, TC-B04): a teammate as Author, any other Creator, Subject or Keywords, and
// XMP metadata fail; "Aditya Gupta" and the project name pass. The "after the pipeline" case runs
// on the real files at ENG-08; here the clean fixture stands in for it.
import { describe, expect, test } from 'vitest';
import vf04 from '../../scripts/verify/rules/vf-04.mjs';
import { golden, resumePdf } from './golden.mjs';
import { buildDir, ids, makePdf, siteCtx } from './helpers.mjs';

const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>';
const withPdf = (path, pdf) => golden({ files: { [path]: pdf } });

describe('VF-04 PDF metadata', () => {
  test('a teammate as Author fails, and the message hides the value', () => {
    const found = vf04.run(
      withPdf('case-studies/Vendrax.pdf', makePdf({ info: { Author: 'Kelvaro Dunn' } })),
    );
    expect(ids(found)).toEqual(['metadata case-studies/Vendrax.pdf']);
    expect(found[0].message).toBe('Author holds something other than "Aditya Gupta" or "Vendrax"');
    expect(found[0].message).not.toContain('Kelvaro');
  });

  test.each(['Creator', 'Subject', 'Keywords'])('any other %s fails', (field) => {
    const pdf = makePdf({ info: { [field]: 'Microsoft Word' } });
    expect(ids(vf04.run(withPdf('case-studies/Skooling.pdf', pdf)))).toEqual([
      'metadata case-studies/Skooling.pdf',
    ]);
  });

  test('XMP in the catalog fails (seen in the raw bytes)', () => {
    const found = vf04.run(withPdf('case-studies/NyaySetu.pdf', makePdf({ xmp: XMP })));
    expect(ids(found)).toEqual(['xmp case-studies/NyaySetu.pdf']);
  });

  test('F2c: XMP on a page, which pdfinfo -meta never reads, fails', () => {
    const found = vf04.run(withPdf('case-studies/NyaySetu.pdf', makePdf({ pageXmp: XMP })));
    expect(ids(found)).toEqual(['xmp case-studies/NyaySetu.pdf']);
  });

  test('F12: a catalog metadata stream with no XMP text fails too (pdfinfo reports it)', () => {
    const found = vf04.run(withPdf('case-studies/NyaySetu.pdf', makePdf({ metadata: 'nothing' })));
    expect(ids(found)).toEqual(['xmp case-studies/NyaySetu.pdf']);
  });

  test('F2b: a custom Info field (Company, Manager) fails, and the message hides the value', () => {
    const pdf = makePdf({ info: { Author: 'Aditya Gupta', Company: 'Kelvaro Ltd' } });
    const found = vf04.run(withPdf('case-studies/Vendrax.pdf', pdf));
    expect(ids(found)).toEqual(['metadata case-studies/Vendrax.pdf']);
    expect(found[0].message).toBe('has a custom metadata field "Company"');
  });

  test('the project name passes on its own PDF, but not on the résumé', () => {
    const named = makePdf({
      info: { Author: 'Aditya Gupta', Subject: 'Vendrax', Keywords: 'Vendrax' },
    });
    expect(vf04.run(withPdf('case-studies/Vendrax.pdf', named))).toEqual([]);
    const resume = resumePdf({ info: { Author: 'Aditya Gupta', Subject: 'Vendrax' } });
    expect(ids(vf04.run(withPdf('Aditya-Gupta-Resume.pdf', resume)))).toEqual([
      'metadata Aditya-Gupta-Resume.pdf',
    ]);
  });

  test('a build with no PDF is a failure: the résumé must be there', () => {
    const ctx = siteCtx(buildDir(null, { 'index.html': '<h1>No PDF here</h1>' }));
    expect(() => vf04.run(ctx)).toThrow(/no PDF in .*Aditya-Gupta-Resume\.pdf/);
  });
});
