// VF-07 tests (ENG-07, TC-B07): each DR-X12 phrase, an emoji bullet and "!" in visible text fail;
// ↗, ©, →, proper nouns and "!" outside visible text pass. The allow-list needs a D-number and
// fails when stale. The phrase list below is copied from the design doc, not from the rule.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import vf07 from '../../scripts/verify/rules/vf-07.mjs';
import { golden } from './golden.mjs';
import { ids, tempDir } from './helpers.mjs';

const inPage = (html, extra = {}) =>
  golden({ edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) }, ...extra });
const allowFile = (entries) => {
  const path = join(tempDir(), 'vf-07.json');
  writeFileSync(path, JSON.stringify(entries));
  return path;
};

// design-brand.md DR-X12, one sentence each, the word in the middle of the sentence.
const DR_X12 = [
  'We are passionate about it.',
  'We leverage the data.',
  'We leveraged the data.',
  'It was seamless.',
  'It ran seamlessly.',
  'A cutting-edge stack.',
  'We unlock value.',
  'Let us delve into it.',
  'A robust system.',
  'Real synergy here.',
  'A game-changer for us.',
  'We revolutionise checkout.',
  'We revolutionize checkout.',
  'We elevate the work.',
  'We empower users.',
  'We harness data.',
  'An innovative idea.',
  'A world-class team.',
  'A results-driven team.',
  'A dynamic team.',
  'A thought leader in fintech.',
  'A rockstar engineer.',
  'A ninja coder.',
  'And in today’s market, speed wins.',
  'A fast-paced team.',
  'A rich tapestry.',
];

describe('VF-07 stock phrases', () => {
  test.each(DR_X12)('"%s" fails', (sentence) => {
    expect(ids(vf07.run(inPage(`<p>${sentence}</p>`)))).toEqual(['phrases index.html']);
  });

  test('a listed word at the start of a sentence fails, even with a capital', () => {
    expect(ids(vf07.run(inPage('<p>Robust plans. Seamless flows.</p>')))).toEqual([
      'phrases index.html',
      'phrases index.html',
    ]);
  });

  test('a proper noun in the middle of a sentence passes (DR-X12)', () => {
    expect(vf07.run(inPage('<p>I worked with Ninja Van and Dynamic Yield.</p>'))).toEqual([]);
  });

  test.each([
    ['an emoji bullet', '<li>✅ Shipped routing</li>'],
    ['a rocket', '<p>Launch 🚀</p>'],
    ['a pictograph with the emoji selector', '<p>Done ✔️</p>'],
    ['a keycap', '<p>1️⃣ First</p>'],
  ])('%s fails', (_, html) => {
    expect(ids(vf07.run(inPage(html)))).toEqual(['emoji index.html']);
  });

  test('"!" in visible text fails, and in alt text too', () => {
    expect(ids(vf07.run(inPage('<p>We did it!</p><img src="/photo.png" alt="Yes!">')))).toEqual([
      'exclamation index.html',
      'exclamation index.html',
    ]);
  });

  test('↗, ©, →, · and "!" in the doctype, a comment or a script pass (the golden site)', () => {
    expect(vf07.run(golden())).toEqual([]);
  });

  test('an allow-list entry with a D-number allows exactly that text on that page', () => {
    const line = 'We leveraged the data.';
    const allowVf07 = allowFile([{ file: 'index.html', text: line, decision: 'D99' }]);
    expect(vf07.run(inPage(`<p>${line}</p>`, { allowVf07 }))).toEqual([]);
    expect(ids(vf07.run(inPage(`<p>${line} Again.</p>`, { allowVf07 })))).toEqual([
      'allow-list scripts/verify/allow/vf-07.json',
      'phrases index.html',
    ]);
  });

  test('an entry without a D-number, or one that matches nothing, fails', () => {
    const noDecision = allowFile([{ file: 'index.html', text: 'x' }]);
    expect(vf07.run(golden({ allowVf07: noDecision }))[0].message).toMatch(/no decision number/);
    const stale = allowFile([{ file: 'index.html', text: 'gone', decision: 'D99' }]);
    expect(vf07.run(golden({ allowVf07: stale }))[0].message).toMatch(/matches no text/);
  });
});
