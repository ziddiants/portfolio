// The real home pages (dist/payments, dist/consumer): TC-C01, TC-C12 and DT-27.
import { expect, test } from '@playwright/test';
import {
  COLOUR_TOKENS,
  canonHex,
  lengthPx,
  loadTokens,
  toRgbString,
} from '../styles/tokens-lib.mjs';
import { BASE } from './ports.mjs';

// PRD H1, written out here on purpose: the test does not read the order from the code under test.
const EXPECTED = [
  ['work', '01 Selected work'],
  ['projects', '02 Product case studies'],
  ['principles', '03 How I think about products'],
  ['about', '04 About'],
  ['experience', '05 Experience'],
  ['toolkit', '06 Toolkit'],
  ['contact', '07 Contact'],
];

for (const id of ['payments', 'consumer']) {
  test(`TC-C01: ${id} home sections follow H1 order with their anchors`, async ({ page }) => {
    await page.goto(`${BASE[id]}/`);
    const sections = await page.$$eval('main > section', (els) =>
      els.map((el) => ({
        id: el.id,
        label: el.querySelector('.label')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
        heading: el.querySelector('h2')?.textContent.trim() ?? null,
        labelledBy: el.getAttribute('aria-labelledby'),
        h2Id: el.querySelector('h2')?.id ?? null,
      })),
    );
    // The hero block comes first and has no anchor (ERD § Routes: seven anchors).
    expect(sections).toHaveLength(EXPECTED.length + 1);
    expect(sections[0].id).toBe('');
    EXPECTED.forEach(([anchor, label], i) => {
      const s = sections[i + 1];
      expect(s.id, `section ${i + 1}`).toBe(anchor);
      expect(s.label).toBe(label);
      expect(s.heading?.length, `${anchor} has an h2`).toBeGreaterThan(0);
      expect(s.labelledBy).toBe(s.h2Id);
    });
    // Each anchor is reachable: the browser can scroll to it.
    for (const [anchor] of EXPECTED) {
      expect(await page.locator(`#${anchor}`).count()).toBe(1);
    }
  });
}

test('TC-C01: every section h2 has at most 7 words (D99)', async ({ page }) => {
  await page.goto(`${BASE.payments}/`);
  const headings = await page.$$eval('main > section[id] h2', (els) =>
    els.map((e) => e.textContent.trim()),
  );
  expect(headings).toHaveLength(7);
  for (const h of headings) expect(h.split(/\s+/).length, h).toBeLessThanOrEqual(7);
});

// TC-C12: the device setting and the visitor's pick decide which colour tokens apply.
// The pick is the data-theme attribute on <html>; the header button that sets it is ENG-13.
const tokens = loadTokens();
const light = tokens.base;
const dark = tokens.darkPick;
const CASES = [
  // [device, pick, expected theme]
  ['light', null, 'light'],
  ['dark', null, 'dark'],
  ['dark', 'light', 'light'],
  ['light', 'dark', 'dark'],
  ['dark', 'dark', 'dark'],
  ['light', 'light', 'light'],
];
for (const [device, pick, theme] of CASES) {
  test(`TC-C12: device ${device}, pick ${pick ?? 'none'} → ${theme} tokens`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: device });
    await page.goto(`${BASE.payments}/`);
    if (pick) await page.evaluate((p) => (document.documentElement.dataset.theme = p), pick);
    const want = theme === 'dark' ? dark : light;
    const got = await page.evaluate((names) => {
      const cs = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim().toLowerCase()]));
    }, COLOUR_TOKENS);
    expect(Object.keys(got)).toHaveLength(COLOUR_TOKENS.length);
    for (const name of COLOUR_TOKENS)
      expect(canonHex(got[name]), `${name} in ${theme}`).toBe(canonHex(want.get(name)));
    // The tokens reach the page: the background and the text colour are the theme's.
    const painted = await page.evaluate(() => ({
      bg: getComputedStyle(document.documentElement).backgroundColor,
      text: getComputedStyle(document.body).color,
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(painted.bg).toBe(toRgbString(want.get('--color-bg')));
    expect(painted.text).toBe(toRgbString(want.get('--color-text')));
    // A pick sets color-scheme to that theme; with no pick the page offers both (tokens.css).
    expect(painted.scheme).toBe(pick ?? 'light dark');
  });
}

for (const width of [360, 1280]) {
  test(`DT-27: the home page reads as a document at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${BASE.payments}/`);
    const found = await page.evaluate(() => {
      const bad = [];
      let checked = 0;
      let widest = 0;
      for (const el of document.querySelectorAll('main, main *')) {
        const cs = getComputedStyle(el);
        checked++;
        if (cs.textAlign !== 'start') bad.push(`${el.tagName} text-align ${cs.textAlign}`);
        if (cs.display.includes('grid')) {
          widest = Math.max(widest, cs.gridTemplateColumns.split(' ').length);
        }
      }
      return { bad, checked, widest };
    });
    expect(found.checked).toBeGreaterThan(10);
    expect(found.bad).toEqual([]);
    expect(found.widest).toBeLessThanOrEqual(2);
  });
}

// Design § Space: --container (72rem) is the widest content area. It stops growing from 1440 px.
for (const width of [1440, 1920]) {
  test(`the content column is --container wide (72rem) at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${BASE.payments}/`);
    const content = await page.$eval('main', (el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    expect(content).toBe(lengthPx(loadTokens().base.get('--container')));
  });
}
