// VF-01 résumé exception (ENG-09, D88): the page text of Aditya-Gupta-Resume.pdf may hold his own
// number, read from phone.txt in the private folder. Nothing else may: not another number in the
// résumé, not its metadata or links, not any page, not any other PDF. Every number is made up at
// test time and never written to the repo (D83).
import { describe, expect, test } from 'vitest';
import vf01 from '../../scripts/verify/rules/vf-01.mjs';
import { golden, privateFiles, resumePdf } from './golden.mjs';
import { fakePhone, fakePrivate, ids, makePdf } from './helpers.mjs';

const own = fakePhone();
let other = fakePhone();
while (other === own) other = fakePhone();
const priv = (phone = `${own}\n`) => fakePrivate({ ...privateFiles(), 'phone.txt': phone });
const RESUME = 'Aditya-Gupta-Resume.pdf';
const withResume = (pdf, privateDir = priv()) => golden({ privateDir, files: { [RESUME]: pdf } });
const text = (phone) => `Aditya Gupta, product manager\nPhone ${phone}`;

describe('VF-01 résumé exception (D88)', () => {
  test.each([
    ['plain', own],
    ['+91 and a space', `+91 ${own}`],
    ['5 + 5 digits', `${own.slice(0, 5)} ${own.slice(5)}`],
    ['dashes', `+91-${own.slice(0, 5)}-${own.slice(5)}`],
  ])("his own number (%s) in the résumé's page text passes", (_, phone) => {
    const ctx = withResume(resumePdf({ text: text(phone) }));
    expect(vf01.run(ctx)).toEqual([]);
  });

  test('another number in the résumé fails', () => {
    const ctx = withResume(resumePdf({ text: text(other) }));
    expect(ids(vf01.run(ctx))).toEqual(['phone Aditya-Gupta-Resume.pdf']);
  });

  test('his own number and another one in the same résumé: only the other fails', () => {
    const ctx = withResume(resumePdf({ text: `${text(own)}\nAlso ${other}` }));
    const found = vf01.run(ctx);
    expect(ids(found)).toEqual(['phone Aditya-Gupta-Resume.pdf']);
    expect(found[0].message).toContain(other.slice(-2));
  });

  test('his own number in the résumé metadata fails (the exception is page text only)', () => {
    const pdf = resumePdf({ info: { Title: `Aditya Gupta ${own}`, Author: 'Aditya Gupta' } });
    expect(ids(vf01.run(withResume(pdf)))).toEqual(['phone Aditya-Gupta-Resume.pdf']);
  });

  test('his own number in a link of the résumé fails', () => {
    for (const uri of [`tel:+91${own}`, `https://wa.me/91${own}`]) {
      const pdf = resumePdf({ links: [uri] });
      expect([...new Set(ids(vf01.run(withResume(pdf))))]).toEqual([
        'phone Aditya-Gupta-Resume.pdf',
      ]);
    }
  });

  test('a tel: word in the résumé text still fails', () => {
    const pdf = resumePdf({ text: `Aditya Gupta, product manager\ntel:+91${own}` });
    expect(ids(vf01.run(withResume(pdf)))).toEqual(['phone Aditya-Gupta-Resume.pdf']);
  });

  test('his own number in another PDF fails', () => {
    const ctx = golden({
      privateDir: priv(),
      files: { 'case-studies/Vendrax.pdf': makePdf({ text: text(own) }) },
    });
    expect(ids(vf01.run(ctx))).toEqual(['phone case-studies/Vendrax.pdf']);
  });

  test('his own number under another name for the résumé fails', () => {
    const ctx = golden({
      privateDir: priv(),
      files: { 'files/cv.pdf': resumePdf({ text: text(own) }) },
    });
    expect(ids(vf01.run(ctx))).toEqual(['phone files/cv.pdf']);
  });

  test('his own number in a page fails', () => {
    const ctx = golden({
      privateDir: priv(),
      edit: { 'index.html': (s) => s.replace('</body>', `<p>Call ${own}</p></body>`) },
    });
    expect(ids(vf01.run(ctx))).toEqual(['phone index.html']);
  });

  test.each([
    ['no phone.txt', fakePrivate(privateFiles())],
    ['an empty phone.txt', priv('# nothing here\n')],
    ['a phone.txt with 9 digits', priv('123456789\n')],
  ])('%s: his number fails too (fails closed)', (_, privateDir) => {
    const ctx = withResume(resumePdf({ text: text(own) }), privateDir);
    expect(ids(vf01.run(ctx))).toEqual(['phone Aditya-Gupta-Resume.pdf']);
  });

  test('a finding never holds the number', () => {
    const found = vf01.run(withResume(resumePdf({ text: text(other) })));
    expect(JSON.stringify(found)).not.toContain(other);
  });
});
