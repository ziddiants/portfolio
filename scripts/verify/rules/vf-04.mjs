// VF-04: PDF metadata (ENG-07, N9, TC-B04). Author, Creator, Subject and Keywords may hold only
// "Aditya Gupta" or the project name (the file's base name, such as "Vendrax"); the résumé may
// hold only "Aditya Gupta". A custom Info field (Company, Manager, …) fails. Any XMP metadata left
// anywhere in a file fails: in the catalog, on a page or on an image (XMP is found in the raw and
// inflated bytes, because pdfinfo -meta reads the catalog only). A finding names the field, never
// its value: an Author field can hold a teammate's name, and CI logs are public.
import { basename } from 'node:path';
import { pdfFiles, pdfInfo, pdfRaw } from '../lib/pdf.mjs';

const FIELDS = ['Author', 'Creator', 'Subject', 'Keywords'];
// Every line plain pdfinfo prints for itself. Any other key came from the file: a custom field.
export const STANDARD = new Set([
  'Title',
  'Subject',
  'Keywords',
  'Author',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
  'Custom Metadata',
  'Metadata Stream',
  'Tagged',
  'UserProperties',
  'Suspects',
  'Form',
  'JavaScript',
  'Pages',
  'Encrypted',
  'Page size',
  'Page rot',
  'File size',
  'Optimized',
  'PDF version',
]);
const XMP = /x:xmpmeta|<rdf:RDF|xmlns:dc=/i;
const RESUME = 'Aditya-Gupta-Resume.pdf';

export default {
  id: 'VF-04',
  title: 'PDF metadata',
  checks: ['metadata', 'xmp'],
  needsPrivate: false,
  pendable: false, // a privacy rule: never on the pending list
  run(ctx) {
    const findings = [];
    for (const file of pdfFiles(ctx)) {
      const name = basename(file);
      const allowed = new Set(['', 'Aditya Gupta']);
      if (name !== RESUME) allowed.add(basename(name, '.pdf'));
      const info = pdfInfo(ctx, file);
      for (const field of FIELDS) {
        if (!allowed.has(info[field] ?? '')) {
          findings.push({
            check: 'metadata',
            file,
            message: `${field} holds something other than ${[...allowed]
              .filter(Boolean)
              .map((a) => `"${a}"`)
              .join(' or ')}`,
            fix: 'run the PDF through scripts/pdf/prepare.mjs (exiftool -all=, then qpdf), ENG-08',
          });
        }
      }
      for (const key of Object.keys(info).filter((k) => !STANDARD.has(k))) {
        findings.push({
          check: 'metadata',
          file,
          message: `has a custom metadata field "${key}"`,
          fix: 'remove it: run the PDF through scripts/pdf/prepare.mjs (exiftool -all=, then qpdf)',
        });
      }
      // Two signals: pdfinfo sees a catalog metadata stream; the bytes show XMP anywhere else.
      if (info['Metadata Stream'] === 'yes' || XMP.test(pdfRaw(ctx, file))) {
        findings.push({
          check: 'xmp',
          file,
          message: 'still holds XMP metadata',
          fix: 'strip it with exiftool -all= and rewrite the file with qpdf (prepare.mjs, ENG-08)',
        });
      }
    }
    return findings;
  },
};
