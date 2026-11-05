// VF-14: fixed wording and structure (ENG-07, H4, H5, C1, C7, TC-B14). The home page shows the
// cohort intro (D51) word for word, exactly three "1-week sprint" tags and the Skooling and
// NyaySetu card lines (H5); the Google Pay page carries the disclaimer (C7); both case studies
// show their headings in C1 order. The wording is approved copy, copied here from the PRD and
// the content pack; it changes only with Aditya's yes, in both places.
//
// Headings (content pack): CarInfo leaves out the "How AI was used" slot; on Google Pay that
// slot is "How I built it in an hour". Other h2 headings (such as a way-onward block) may sit in
// between; only the order and presence of these ones is checked.
import { elements, pages, textOf, walk } from '../lib/site.mjs';
import { fold } from '../lib/text.mjs';

const HOME = 'index.html';
const GPAY = 'work/google-pay-resolution-tracker.html';
const INTRO = fold(
  'Three products I took from problem to PRD in one-week sprints during the Rethink Systems AI PM program.',
);
const TAG = '1-week sprint';
const CARD_LINES = ['My PRD · My prototype', 'Prototype in progress'].map(fold);
const DISCLAIMER = fold('Independent case study. Not affiliated with Google.');
const BEFORE = [
  'Context',
  'Problem and users',
  'Evidence',
  'Insight',
  'Options and decision',
  'What shipped',
];
const AFTER = ['My role and team', 'Outcomes', 'What I learned', "What's next"];
export const C1 = {
  'work/carinfo-payments.html': [...BEFORE, ...AFTER],
  [GPAY]: [...BEFORE, 'How I built it in an hour', ...AFTER],
};
const ALL_HEADINGS = new Set(Object.values(C1).flat());

/** Every element whose own folded text is exactly `text`, innermost only. */
function exact(doc, text) {
  return [...walk(doc)].filter(
    (el) =>
      el.tagName &&
      textOf(el) === text &&
      !el.childNodes.some((c) => c.tagName && textOf(c) === text),
  );
}

export default {
  id: 'VF-14',
  title: 'Fixed wording and structure',
  checks: ['cohort-intro', 'tags', 'card-lines', 'disclaimer', 'c1-order'],
  needsPrivate: false,
  run(ctx) {
    const byFile = new Map(pages(ctx).map((p) => [p.file, p]));
    const findings = [];
    const add = (check, file, message, fix = 'restore the approved wording in the content file') =>
      findings.push({ check, file, message, fix });

    const home = byFile.get(HOME);
    if (!home) {
      for (const check of ['cohort-intro', 'tags', 'card-lines'])
        add(check, HOME, 'the home page is missing');
    } else {
      if (exact(home.doc, INTRO).length === 0)
        add('cohort-intro', HOME, 'the cohort intro (D51) is missing or altered');
      const tags = exact(home.doc, TAG).length;
      if (tags !== 3) add('tags', HOME, `shows ${tags} "${TAG}" tags, not 3 (H4)`);
      for (const line of CARD_LINES) {
        if (exact(home.doc, line).length === 0)
          add('card-lines', HOME, `the card line "${line}" is missing or altered (H5)`);
      }
    }

    const gpay = byFile.get(GPAY);
    if (!gpay) add('disclaimer', GPAY, 'the Google Pay page is missing');
    else if (exact(gpay.doc, DISCLAIMER).length === 0)
      add('disclaimer', GPAY, 'the disclaimer (C7) is missing or altered');

    for (const [file, expected] of Object.entries(C1)) {
      const page = byFile.get(file);
      if (!page) {
        add(
          'c1-order',
          file,
          'the case-study page is missing',
          'build the page (ENG-18 to ENG-20)',
        );
        continue;
      }
      const shown = elements(page.doc, 'h2')
        .map(textOf)
        .filter((t) => ALL_HEADINGS.has(t));
      if (shown.join('|') !== expected.join('|')) {
        const at = expected.findIndex((h, i) => shown[i] !== h);
        add(
          'c1-order',
          file,
          `headings are not in C1 order: expected "${expected[at]}" at place ${at + 1}, found "${shown[at] ?? 'nothing'}"`,
          'put the headings in C1 order (CaseStudyLayout, ENG-18)',
        );
      }
    }
    return findings;
  },
};
