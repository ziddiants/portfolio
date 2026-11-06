// VF-08: approved numbers (ENG-07, T2, TC-B08). Every percentage, rupee or multiplier figure a
// visitor reads (body, title, descriptions, alt) must be in that version's approvedNumbers, and
// every approved number must be in that version's résumé. Figures are compared in one form:
// lower case, no spaces, no commas, "Rs"/"INR" as "₹", "per cent" as "%", "×" as "x", one
// kind of dash, no plus sign. The unit stays: "₹2.5L" is "₹2.5l", and "₹2.5 lakh" is another figure.
import { pdfFiles, pdfText } from '../lib/pdf.mjs';
import { pages, readable } from '../lib/site.mjs';
import { snippet } from '../lib/text.mjs';

// Units are part of the figure and match in any case: "₹12 Crore" is not "₹12 Lakh" (review F3).
const RUPEE_UNIT =
  '(?:lakhs|lakh|lacs|lac|crores|crore|cr|millions|million|mn|billions|billion|bn|thousand|k|l|m|b)';
const NUM = '\\d[\\d,]*(?:\\.\\d+)?';
const RANGE = `${NUM}(?:\\s?[-–—]\\s?${NUM})?`; // "10–46%": both ends belong to the figure
const FIGURE = new RegExp(
  '(?<![\\p{L}\\p{N}.])(?:' +
    `(?:₹|Rs\\.?|INR)\\s?${RANGE}(?:\\s?${RUPEE_UNIT})?` +
    `|[+\\-−]?${RANGE}\\s?(?:%|per\\s?cent)` +
    '|\\d+(?:\\.\\d+)?\\s?[x×]' +
    ')(?![\\p{L}\\p{N}])',
  'giu',
);
const RESUME = 'Aditya-Gupta-Resume.pdf';

/** A figure in its one compared form. */
export const normFigure = (s) =>
  s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .replace(/^(?:rs\.?|inr)/, '₹')
    .replace(/percent$/, '%')
    .replace(/×$/, 'x')
    .replace(/[–—]/g, '-')
    .replace(/^\+/, '')
    .replace(/^−/, '-');

/** Every figure in a text, in compared form. */
export const figures = (text) => [...text.matchAll(FIGURE)].map((m) => normFigure(m[0]));

export default {
  id: 'VF-08',
  title: 'Approved numbers',
  checks: ['figures', 'resume-present', 'approved-in-resume'],
  needsPrivate: false,
  run(ctx) {
    const v = ctx.version;
    if (!v) throw new Error("verify needs this version's settings (ctx.version)");
    const where = `versions/${v.id}/version.json`;
    const approved = new Set(v.approvedNumbers.flatMap(figures));
    const findings = [];

    for (const page of pages(ctx)) {
      for (const text of readable(page)) {
        for (const fig of figures(text)) {
          if (approved.has(fig)) continue;
          findings.push({
            check: 'figures',
            file: page.file,
            message: `shows ${fig}, which is not in ${where} approvedNumbers ("${snippet(text, 60)}")`,
            fix: 'use the résumé figure exactly (T2); a new figure needs the résumé and approvedNumbers first',
          });
        }
      }
    }

    // CI has no private folder, so its résumé is a stub (D90): the résumé checks cannot run. A
    // local build, which has the real file, always runs them.
    if (ctx.mode === 'ci') return findings;

    const resume = pdfFiles(ctx).find((f) => f === RESUME);
    const inResume = resume ? new Set(figures(pdfText(ctx, resume))) : null;
    if (!inResume) {
      // Its own check, so it can never ride on a pending one (review finding F7).
      findings.push({
        check: 'resume-present',
        message: `the build has no ${RESUME}`,
        fix: 'assemble-public.mjs copies the résumé; check the build',
      });
      return findings;
    }
    for (const entry of v.approvedNumbers) {
      const f = figures(entry);
      if (f.length !== 1 || normFigure(entry) !== f[0]) {
        findings.push({
          check: 'approved-in-resume',
          file: where,
          message: `approvedNumbers holds "${snippet(entry, 50)}", which is not one figure`,
          fix: 'list each figure on its own, as the résumé writes it (ENG-09)',
        });
      } else if (!inResume.has(f[0])) {
        findings.push({
          check: 'approved-in-resume',
          file: where,
          message: `approved number ${f[0]} is not in the résumé`,
          fix: 'remove it, or fix the résumé first: the site follows the résumé (T2)',
        });
      }
    }
    return findings;
  },
};
