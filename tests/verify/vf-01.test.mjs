// VF-01 tests (ENG-07, TC-B01): phone numbers in pages, links and PDFs fail; figures, years and
// asset hashes pass. Every number is made up at test time (C1); none is ever written to the repo.
import { describe, expect, test } from 'vitest';
import vf01, { phoneKind } from '../../scripts/verify/rules/vf-01.mjs';
import { golden, resumePdf } from './golden.mjs';
import { fakePhone, ids, makePdf } from './helpers.mjs';

const p = fakePhone();
const inPage = (html) =>
  golden({ edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) } });

describe('VF-01 phone numbers', () => {
  test.each([
    ['+91 and a space', `+91 ${p}`],
    ['5 + 5 digits', `${p.slice(0, 5)} ${p.slice(5)}`],
    ['(+91)- and 10 digits', `(+91)-${p}`],
    ['dashes', `+91-${p.slice(0, 5)}-${p.slice(5)}`],
    ['a leading 0', `0${p}`],
    ['91 with no plus', `91${p}`],
    ['two numbers side by side', `${p.slice(0, 5)} ${p.slice(5)} ${p.slice(0, 5)} ${p.slice(5)}`],
    ['another country', '+44 20 7946 0958'],
  ])('a page with a phone number (%s) fails', (_, number) => {
    const found = vf01.run(inPage(`<p>Call me on ${number} today.</p>`));
    expect(ids(found)).toEqual(['phone index.html']);
  });

  test('a tel: link fails, even with the digits hidden behind an entity', () => {
    const found = vf01.run(inPage(`<a href="tel:&#43;91${p}">Call</a>`));
    expect(found.map((f) => f.message.replace(/ \(.*/, '')).sort()).toEqual([
      'holds a tel: link',
      'holds an Indian mobile number',
    ]);
  });

  test('a phone number in a PDF fails (the résumé included)', () => {
    const ctx = golden({
      files: {
        'Aditya-Gupta-Resume.pdf': resumePdf({ text: `Aditya Gupta, product manager\nPhone ${p}` }),
      },
    });
    expect(ids(vf01.run(ctx))).toEqual(['phone Aditya-Gupta-Resume.pdf']);
  });

  test('a phone number in a PDF info field VF-04 does not limit (Title) fails', () => {
    const pdf = resumePdf({ info: { Title: `Aditya Gupta ${p}`, Author: 'Aditya Gupta' } });
    expect(ids(vf01.run(golden({ files: { 'Aditya-Gupta-Resume.pdf': pdf } })))).toEqual([
      'phone Aditya-Gupta-Resume.pdf',
    ]);
  });

  test('F1: a PDF with no text layer cannot be scanned, so it fails (never an empty pass)', () => {
    const ctx = golden({ files: { 'case-studies/Vendrax.pdf': makePdf({ text: '' }) } });
    expect(() => vf01.run(ctx)).toThrow(/case-studies\/Vendrax\.pdf has no readable text layer/);
  });

  test('F2a: a tel: or wa.me link inside a PDF fails', () => {
    for (const uri of [`tel:+91${p}`, `https://wa.me/91${p}`]) {
      const ctx = golden({ files: { 'case-studies/Vendrax.pdf': makePdf({ links: [uri] }) } });
      expect([...new Set(ids(vf01.run(ctx)))]).toEqual(['phone case-studies/Vendrax.pdf']);
    }
  });

  test.each([
    ['a line break in PDF text', 'pdf', `+91 ${p.slice(0, 5)}\n${p.slice(5)}`],
    ['narrow no-break spaces', 'html', `${p.slice(0, 5)}\u202f${p.slice(5)}`],
    ['thin spaces', 'html', `${p.slice(0, 5)}\u2009${p.slice(5)}`],
    ['a zero-width space', 'html', `${p.slice(0, 5)}\u200b${p.slice(5)}`],
    ['a soft hyphen', 'html', `${p.slice(0, 5)}\u00ad${p.slice(5)}`],
    ['letters right before the digits', 'html', `Mob${p}`],
    [
      'digits split across table cells',
      'html',
      `</p><table><tr><td>${p.slice(0, 5)}</td><td>${p.slice(5)}</td></tr></table><p>`,
    ],
  ])('F5: a phone number with %s fails', (_, where, number) => {
    const ctx =
      where === 'pdf'
        ? golden({
            files: {
              'Aditya-Gupta-Resume.pdf': resumePdf({
                text: `Aditya Gupta, product manager\n${number}`,
              }),
            },
          })
        : inPage(`<p>Call ${number}</p>`);
    expect(ids(vf01.run(ctx)).length).toBeGreaterThan(0);
  });

  test('F4: phones in files of any type fail: .vcf, .md, no extension, image metadata', () => {
    for (const file of ['contact.vcf', 'notes.md', 'data/README', 'files/x.csv']) {
      const ctx = golden({ files: { [file]: `TEL:+91 ${p}\n` } });
      expect([...new Set(ids(vf01.run(ctx)))]).toEqual([`phone ${file}`]);
    }
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
      Buffer.from(`Exif Owner +91 ${p}`, 'latin1'),
    ]);
    expect(ids(vf01.run(golden({ files: { 'photo.jpg': jpeg } })))).toEqual(['phone photo.jpg']);
  });

  test('the message never shows the number: only its last two digits', () => {
    const [f] = vf01.run(inPage(`<p>${p}</p>`));
    expect(f.message).not.toContain(p);
    expect(f.message).not.toContain(p.slice(0, 8));
    expect(f.message).toContain(`••••••••${p.slice(8)}`);
  });

  test('figures, years, ranges and asset hashes pass', () => {
    const html = `<p>46% · 2026 · ₹2.5L · 2015–2019 · 1,00,000 users · 30–50 orders</p>
      <link rel="preload" href="/_astro/index.B${p}x.js" as="script">`;
    expect(vf01.run(inPage(html))).toEqual([]);
    // The hash is safe because a letter touches the digits; the rule run above proves that.
    for (const s of ['46%', '2026', '₹2.5L', '2015–2019']) expect(phoneKind(s)).toBeNull();
  });

  test('without pdftotext the rule throws (a failure), never passes', () => {
    const ctx = golden();
    const path = process.env.PATH;
    process.env.PATH = '';
    try {
      expect(() => vf01.run(ctx)).toThrow(/pdftotext is not installed/);
    } finally {
      process.env.PATH = path;
    }
  });
});
