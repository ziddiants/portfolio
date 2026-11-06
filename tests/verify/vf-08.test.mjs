// VF-08 tests (ENG-07, TC-B08): "45%" fails and "46%" passes; an approved number missing from the
// résumé fails; rupee and multiplier forms compare in one form; figures in descriptions count.
import { describe, expect, test } from 'vitest';
import vf08, { figures, normFigure } from '../../scripts/verify/rules/vf-08.mjs';
import { APPROVED, golden, resumePdf, ROOT, SITE } from './golden.mjs';
import { buildDir, fakeVersion, ids, siteCtx } from './helpers.mjs';

const inPage = (html, extra = {}) =>
  golden({ edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) }, ...extra });
const withApproved = (list) => fakeVersion('alpha', { approvedNumbers: list });

describe('VF-08 approved numbers', () => {
  test('"45%" on a page fails; "46%" passes', () => {
    const found = vf08.run(inPage('<p>Success rose to 45%.</p>'));
    expect(ids(found)).toEqual(['figures index.html']);
    expect(found[0].message).toMatch(/^shows 45%, which is not in versions\/alpha\/version\.json/);
    expect(vf08.run(inPage('<p>Success rose to 46%.</p>'))).toEqual([]);
  });

  test.each([
    ['₹2.6L', 'fail'],
    ['₹2.5 L', 'pass'],
    ['Rs. 2.5L', 'pass'],
    ['INR 2.5L', 'pass'],
    ['₹2.5 lakh', 'fail'],
    ['3x', 'fail'],
    ['3×', 'fail'],
    ['+16%', 'pass'],
    ['-16%', 'fail'],
  ])('%s on a page: %s', (figure, outcome) => {
    const found = vf08.run(inPage(`<p>About ${figure} a month.</p>`));
    expect(found.length === 0 ? 'pass' : 'fail').toBe(outcome);
  });

  test('F3: the unit is part of the figure, in any case: lakh is not crore', () => {
    const version = fakeVersion('alpha', { approvedNumbers: [...APPROVED, '₹12 Crore'] });
    const resume = resumePdf({
      text: 'Aditya Gupta\nPayment success 46% to 67%, revenue +16%, about Rs 2.5L a month\nSaved Rs 12 Crore',
    });
    const ctx = (html) =>
      golden({
        version,
        files: { 'Aditya-Gupta-Resume.pdf': resume },
        edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) },
      });
    expect(vf08.run(ctx('<p>Saved ₹12 crore.</p>'))).toEqual([]);
    for (const wrong of ['₹12 Lakh', '₹12 billion', '₹12 Cr', '₹12 million', '₹12']) {
      expect(ids(vf08.run(ctx(`<p>Saved ${wrong}.</p>`)))).toEqual(['figures index.html']);
    }
  });

  test('F3: both ends of a range count; "percent" is a percentage', () => {
    expect(ids(vf08.run(inPage('<p>From 10–46% of users.</p>')))).toEqual(['figures index.html']);
    expect(ids(vf08.run(inPage('<p>About 35 percent.</p>')))).toEqual(['figures index.html']);
    expect(ids(vf08.run(inPage('<p>About 46 per cent.</p>')))).toEqual([]);
  });

  test('a figure in the meta description or alt text counts', () => {
    const ctx = golden({
      edit: { 'index.html': (s) => s.replaceAll('rose from 46% to 67%', 'rose from 46% to 68%') },
    });
    expect(ids(vf08.run(ctx))).toEqual(['figures index.html', 'figures index.html']);
    expect(ids(vf08.run(inPage('<img src="/photo.png" alt="A 12% drop">')))).toEqual([
      'figures index.html',
    ]);
  });

  test('an approved number that is not in the résumé fails', () => {
    const found = vf08.run(golden({ version: withApproved([...APPROVED, '99%']) }));
    expect(found).toMatchObject([
      { check: 'approved-in-resume', file: 'versions/alpha/version.json' },
    ]);
    expect(found[0].message).toBe('approved number 99% is not in the résumé');
  });

  test('an approvedNumbers entry that is not one figure fails (today: the placeholders)', () => {
    const found = vf08.run(golden({ version: withApproved(['PLACEHOLDER (ENG-09): numbers']) }));
    expect(found.map((f) => f.check)).toContain('approved-in-resume');
    expect(found.find((f) => f.check === 'approved-in-resume').message).toMatch(/not one figure/);
  });

  test('a build without the résumé fails the résumé check', () => {
    const dist = buildDir(SITE, { 'case-studies/Vendrax.pdf': resumePdf() });
    const ctx = siteCtx(dist, { root: ROOT, version: withApproved(APPROVED) });
    expect(vf08.run(ctx)).toMatchObject([
      { check: 'resume-present', message: 'the build has no Aditya-Gupta-Resume.pdf' },
    ]);
  });

  test('figures and their one compared form', () => {
    expect(figures('46% → 67%, +16%, ~₹2.5L/month, 3× faster, in 2026, 15 PMs')).toEqual([
      '46%',
      '67%',
      '16%',
      '₹2.5l',
      '3x',
    ]);
    expect(normFigure('Rs. 2,50,000')).toBe('₹250000');
    expect(normFigure('₹12 Crore')).toBe('₹12crore');
    expect(normFigure('10–46 per cent')).toBe('10-46%');
  });
});

describe('VF-08 in CI mode (D90)', () => {
  const stub = {
    'Aditya-Gupta-Resume.pdf': resumePdf({ text: 'CI stub, not a resume.\nNothing else here.' }),
  };
  test('the résumé checks are skipped: the CI résumé is a stub with no figures', () => {
    const ctx = golden({ mode: 'ci', files: stub });
    expect(vf08.run(ctx)).toEqual([]);
  });
  test('a figure on a page is still checked in CI mode', () => {
    const ctx = inPage('<p>Success rose to 45%.</p>', { mode: 'ci', files: stub });
    expect(ids(vf08.run(ctx))).toEqual(['figures index.html']);
  });
  test('local mode runs the résumé checks on the same stub and fails', () => {
    const ctx = golden({ mode: 'local', files: stub });
    expect(ids(vf08.run(ctx)).every((i) => i.startsWith('approved-in-resume'))).toBe(true);
    expect(vf08.run(ctx).length).toBeGreaterThan(0);
  });
});
