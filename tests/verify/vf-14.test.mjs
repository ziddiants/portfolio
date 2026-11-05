// VF-14 tests (ENG-07, TC-B14): the cohort intro changed by one word, a tag missing, a card line
// changed, the disclaimer missing, or case-study headings swapped each fail.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import vf14 from '../../scripts/verify/rules/vf-14.mjs';
import { golden } from './golden.mjs';
import { ids } from './helpers.mjs';

const GPAY = 'work/google-pay-resolution-tracker.html';
const CARINFO = 'work/carinfo-payments.html';
const edit = (file, change) => golden({ edit: { [file]: change } });

describe('VF-14 fixed wording and structure', () => {
  test.each([
    ['cohort-intro', 'index.html', (s) => s.replace('one-week sprints', 'one-week cycles')],
    ['cohort-intro', 'index.html', (s) => s.replace('program.', 'programme.')],
    [
      'tags',
      'index.html',
      (s) => s.replace('<span class="tag">1-week sprint</span> Vendrax', 'Vendrax'),
    ],
    ['tags', 'index.html', (s) => s.replace('</ul>', '<li><span>1-week sprint</span></li></ul>')],
    ['tags', 'index.html', (s) => s.replaceAll('1-week sprint', '1 week sprint')],
    ['card-lines', 'index.html', (s) => s.replace('My PRD · My prototype', 'My PRD and prototype')],
    [
      'card-lines',
      'index.html',
      (s) => s.replace('Prototype in progress', 'Prototype coming soon'),
    ],
    [
      'disclaimer',
      GPAY,
      (s) => s.replace('<p>Independent case study. Not affiliated with Google.</p>', ''),
    ],
    ['disclaimer', GPAY, (s) => s.replace('Not affiliated with Google.', 'Not linked to Google.')],
    [
      'c1-order',
      CARINFO,
      (s) =>
        s.replace(
          '<h2>Evidence</h2>\n    <h2>Insight</h2>',
          '<h2>Insight</h2>\n    <h2>Evidence</h2>',
        ),
    ],
    ['c1-order', CARINFO, (s) => s.replace('<h2>Outcomes</h2>', '')],
    [
      'c1-order',
      CARINFO,
      (s) =>
        s.replace(
          '<h2>What shipped</h2>',
          '<h2>What shipped</h2><h2>How I built it in an hour</h2>',
        ),
    ],
    [
      'c1-order',
      GPAY,
      (s) => s.replace('<h2>How I built it in an hour</h2>', '<h2>How AI was used</h2>'),
    ],
  ])('%s: a change to %s fails', (check, file, change) => {
    expect(ids(vf14.run(edit(file, change)))).toEqual([`${check} ${file}`]);
  });

  test('swapped headings say where the order breaks', () => {
    const [f] = vf14.run(
      edit(CARINFO, (s) =>
        s
          .replace('<h2>Context</h2>', '')
          .replace('<h2>Evidence</h2>', '<h2>Evidence</h2><h2>Context</h2>'),
      ),
    );
    expect(f.message).toBe(
      'headings are not in C1 order: expected "Context" at place 1, found "Problem and users"',
    );
  });

  test('missing pages fail every check that needs them', () => {
    const ctx = golden();
    for (const f of [GPAY, CARINFO]) rmSync(join(ctx.distDir, f));
    expect(ids(vf14.run(ctx))).toEqual([
      `c1-order ${CARINFO}`,
      `c1-order ${GPAY}`,
      `disclaimer ${GPAY}`,
    ]);
  });

  test('extra text around the wording, curly quotes and an extra h2 pass (the golden site)', () => {
    expect(vf14.run(golden())).toEqual([]);
  });
});
