// VF-03 tests (ENG-07, TC-B03, TC-A06): another version's résumé file (under any name), bullet,
// subline (with "&", which Astro writes as "&amp;"), address and project name each fail; text both
// versions share passes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import vf03 from '../../scripts/verify/rules/vf-03.mjs';
import { golden, resumePdf } from './golden.mjs';
import { fakeVersion, ids } from './helpers.mjs';

const beta = fakeVersion('beta', { analyticsToken: 'beta0analytics0token' });
const page = (html, extra = {}) =>
  golden({
    others: [beta],
    edit: { 'index.html': (s) => s.replace('</body>', `${html}</body>`) },
    ...extra,
  });
const esc = (s) => s.replace(/&/g, '&amp;');

describe('VF-03 version isolation', () => {
  test("the other version's résumé, renamed, fails (by checksum)", () => {
    const ctx = golden({
      others: [beta],
      files: { 'files/cv.pdf': readFileSync(join(beta.dir, 'resume.pdf')) },
    });
    const found = vf03.run(ctx);
    expect(ids(found)).toEqual(['other-file files/cv.pdf']);
    expect(found[0].message).toBe('is a copy of versions/beta/resume.pdf');
  });

  test("the other version's preview image fails too", () => {
    const ctx = golden({
      others: [beta],
      files: { 'og.png': readFileSync(join(beta.dir, 'og.png')) },
    });
    expect(ids(vf03.run(ctx))).toEqual(['other-file og.png']);
  });

  test.each([
    ['bullets', `<li>${beta.carinfoBullets[0]}</li>`],
    ['subline', `<p>${esc(beta.heroSubline)}</p>`],
    ['project', '<p>Deployed with beta-test as the project.</p>'],
  ])("the other version's %s fails", (check, html) => {
    expect(ids(vf03.run(page(html)))).toEqual([`${check} index.html`]);
  });

  test('TC-A06: a link to the other address fails, also on a preview subdomain', () => {
    for (const url of ['https://beta-test.pages.dev/', 'https://eng-07.beta-test.pages.dev/work']) {
      const found = vf03.run(page(`<a href="${url}">other site</a>`));
      expect(ids(found)).toEqual(['address index.html', 'project index.html']);
    }
  });

  test("the other version's address in a PDF fails", () => {
    const pdf = resumePdf({ text: 'Aditya Gupta\nSite: https://beta-test.pages.dev' });
    const ctx = golden({ others: [beta], files: { 'Aditya-Gupta-Resume.pdf': pdf } });
    expect(ids(vf03.run(ctx))).toContain('address Aditya-Gupta-Resume.pdf');
  });

  test("F8: the other version's page title and analytics token fail", () => {
    expect(ids(vf03.run(page(`<p>${beta.pageTitle}</p>`)))).toEqual(['title index.html']);
    expect(ids(vf03.run(page(`<p data-t="${beta.analyticsToken}">x</p>`)))).toEqual([
      'analytics index.html',
    ]);
  });

  test("F8: the other version's address in a PDF Info field fails", () => {
    const pdf = resumePdf({
      info: { Author: 'Aditya Gupta', Title: 'https://beta-test.pages.dev' },
    });
    const ctx = golden({ others: [beta], files: { 'Aditya-Gupta-Resume.pdf': pdf } });
    expect(ids(vf03.run(ctx))).toContain('address Aditya-Gupta-Resume.pdf');
  });

  test('a bullet both versions share passes', () => {
    const shared = 'Rebuilt payment routing across three gateways';
    const alpha = fakeVersion('alpha', { carinfoBullets: [shared] });
    const twin = fakeVersion('beta', { carinfoBullets: [shared] });
    const ctx = golden({
      version: alpha,
      others: [twin],
      edit: { 'index.html': (s) => s.replace('</body>', `<li>${shared}</li></body>`) },
    });
    expect(vf03.run(ctx)).toEqual([]);
  });

  test('a longer word that holds the project name passes', () => {
    expect(vf03.run(page('<p>beta-tested and alpha-beta-test-suite</p>'))).toEqual([]);
  });
});
