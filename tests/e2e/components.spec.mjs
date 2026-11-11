// The shared components, on the fixture page (tests/e2e/fixture-page.mjs): DT-06, DT-08, DT-11,
// DT-16, DT-22 and TC-B13. The fixture is built in a temp copy; it is not part of any real site.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import vf13 from '../../scripts/verify/rules/vf-13.mjs';
import { lengthPx, loadTokens, sizeAt, toRgbString } from '../styles/tokens-lib.mjs';
import { SAMPLE_LABEL } from './fixture-page.mjs';
import { BASE } from './ports.mjs';

const tokens = loadTokens().base;
const FIXTURE = `${BASE.fixture}/fixture`;
const px = (name, width) => sizeAt(tokens.get(name), width);

test('DT-06: type sizes follow the scale at 360, 768, 1280 and 1920 px', async ({ page }) => {
  // Hero line, h1 and h3 have no component yet (ENG-14, ENG-15, ENG-18 add them).
  const ROWS = [
    ['body', '#p1', '--text-body'],
    ['h2', '#fx h2', '--text-h2'],
    ['lead', '#fx .intro', '--text-lead'],
    ['small', 'a.button', '--text-small'],
    ['label', '#fx .label', '--text-label'],
  ];
  for (const width of [360, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(FIXTURE);
    for (const [name, selector, token] of ROWS) {
      const size = await page
        .locator(selector)
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(Math.abs(size - px(token, width)), `${name} at ${width}`).toBeLessThanOrEqual(0.5);
    }
  }
});

test('DT-08: numbers line up (tabular numerals on .num and <time>)', async ({ page }) => {
  await page.goto(FIXTURE);
  for (const selector of ['#num', '#time']) {
    const v = await page
      .locator(selector)
      .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
    expect(v, selector).toContain('tabular-nums');
  }
});

for (const [width, phone] of [
  [360, true],
  [1280, false],
]) {
  test(`DT-11: rhythm matches § Space at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(FIXTURE);
    const margin = (selector, side) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, s) => parseFloat(getComputedStyle(el)[s]), side);
    const want = (name) => lengthPx(tokens.get(name));
    // Rows with no component yet: cards in a list (ENG-15), hero top padding (ENG-14).
    expect(await margin('#fx', 'marginTop'), 'between home sections').toBe(
      want(phone ? '--space-8' : '--space-10'),
    );
    expect(await margin('#fx .label', 'marginBottom'), 'label to heading').toBe(want('--space-2'));
    expect(await margin('#fx .section-header', 'marginBottom'), 'heading to content').toBe(
      want(phone ? '--space-5' : '--space-6'),
    );
    expect(await margin('#p2', 'marginTop'), 'between paragraphs').toBe(want('--space-4'));
  });
}

test('DT-16: every focusable element shows a 2 px ring with a 2 px offset', async ({ page }) => {
  await page.goto(FIXTURE);
  const accent = toRgbString(tokens.get('--color-accent'));
  const seen = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        text: el.textContent.trim().slice(0, 20),
        style: cs.outlineStyle,
        width: cs.outlineWidth,
        offset: cs.outlineOffset,
        color: cs.outlineColor,
      };
    });
    if (!f) break;
    seen.push(f);
  }
  // Inline, arrow, two outside links, the plain outside link, and the three buttons.
  expect(seen.length).toBe(8);
  for (const f of seen) {
    expect(f, f.text).toMatchObject({ style: 'solid', width: '2px', offset: '2px', color: accent });
  }
});

test('DT-16: buttons are at least 44 px tall (48 px full width on phones); hover changes colour only', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(FIXTURE);
  const box = (selector) => page.locator(selector).first().boundingBox();
  for (const b of await page.locator('a.button').all()) {
    expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  const wide = await box('a.button.wide');
  expect(wide.height).toBeGreaterThanOrEqual(48);
  const main = await box('main');
  const gutter = lengthPx(tokens.get('--page-gutter'));
  expect(Math.round(wide.width)).toBe(Math.round(main.width - 2 * gutter));

  await page.setViewportSize({ width: 1280, height: 800 });
  const desktopWide = await box('a.button.wide');
  expect(desktopWide.height).toBeGreaterThanOrEqual(44);
  expect(desktopWide.width).toBeLessThan(400);

  const primary = page.locator('a.button.primary').first();
  const before = await primary.evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    rect: JSON.stringify(el.getBoundingClientRect()),
  }));
  await primary.hover();
  await page.waitForTimeout(300);
  const after = await primary.evaluate((el) => ({
    bg: getComputedStyle(el).backgroundColor,
    rect: JSON.stringify(el.getBoundingClientRect()),
    transform: getComputedStyle(el).transform,
  }));
  expect(before.bg).toBe(toRgbString(tokens.get('--color-accent')));
  expect(after.bg).toBe(toRgbString(tokens.get('--color-accent-hover')));
  expect(after.rect).toBe(before.rect);
  expect(after.transform).toBe('none');
});

test('DT-22: an outside link shows ↗, says it opens a new tab, and carries rel', async ({
  page,
}) => {
  await page.goto(FIXTURE);
  const link = page.locator('a[href="https://example.org/x"]');
  expect(await link.getAttribute('target')).toBe('_blank');
  expect((await link.getAttribute('rel')).split(/\s+/).sort()).toEqual(['noopener', 'noreferrer']);
  // What a screen reader announces: the ↗ is hidden from it, the helper text is read, with a space.
  await expect(
    page.getByRole('link', { name: 'Outside link (opens in a new tab)', exact: true }),
  ).toHaveCount(1);
  expect(await link.locator('.mark').textContent()).toBe('↗');
  // The hidden text is visually hidden (1 px) but still in the accessibility tree.
  const hidden = link.locator('.visually-hidden');
  expect((await hidden.boundingBox()).width).toBeLessThanOrEqual(1);
});

test('DT-22: the download label names the type and the real size of the file', async ({ page }) => {
  await page.goto(FIXTURE);
  const button = page.locator('a[download]');
  await expect(page.getByRole('link', { name: SAMPLE_LABEL, exact: true })).toHaveCount(1);
  expect(await button.locator('.mark').textContent()).toBe('↓');
  // The file the button points at is the size the label says (118,400 bytes → 118 KB).
  const res = await page.request.get(new URL(await button.getAttribute('href'), FIXTURE).href);
  expect(res.status()).toBe(200);
  const bytes = (await res.body()).length;
  expect(`${Math.round(bytes / 1000)} KB`).toBe('118 KB');
});

test('TC-B13: VF-13 passes ExternalLink and fails a plain outside link', async ({ page }) => {
  await page.goto(FIXTURE);
  const dir = mkdtempSync(join(tmpdir(), 'eng12-vf13-'));
  try {
    writeFileSync(join(dir, 'index.html'), await page.content());
    const findings = vf13.run({
      root: dir,
      distDir: dir,
      version: { siteUrl: 'https://aditya-payments-pm.pages.dev' },
    });
    // Two findings (rel and marker), both for the plain link; none for ExternalLink.
    expect(findings.map((f) => f.check).sort()).toEqual(['marker', 'rel']);
    for (const f of findings) expect(f.message).toContain('https://example.org/plain');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Figure and MarginNote render with their required parts', async ({ page }) => {
  await page.goto(FIXTURE);
  const fig = page.locator('figure');
  await expect(fig.locator('img')).toHaveAttribute('alt', 'A payment status screen.');
  expect(await fig.locator('img').getAttribute('width')).not.toBeNull();
  expect(await fig.locator('img').getAttribute('height')).not.toBeNull();
  await expect(fig.locator('figcaption')).toHaveText('Look at the status line.');
  const note = page.locator('aside.margin-note');
  await expect(note.locator('.tag')).toHaveText('Fact');
  await expect(note.locator('.source')).toHaveText('S-014');
  // The aside sits right after the paragraph it supports, so reading order is right (DS-CMP-16).
  expect(await note.evaluate((el) => el.previousElementSibling?.id)).toBe('p2');
});

test('Link and ExternalLink pass other attributes through; ExternalLink sets rel and target', async ({
  page,
}) => {
  await page.goto(FIXTURE);
  expect(await page.locator('#inline').getAttribute('data-kind')).toBe('inline');
  const ext = page.locator('#ext2');
  expect(await ext.getAttribute('data-kind')).toBe('ext');
  // rel and target are the component's own; a caller cannot pass them (assertNoOwnAttributes).
  expect(await ext.getAttribute('target')).toBe('_blank');
  expect((await ext.getAttribute('rel')).split(/\s+/).sort()).toEqual(['noopener', 'noreferrer']);
});

test('MarginNote leaves --space-4 before the next paragraph', async ({ page }) => {
  await page.goto(FIXTURE);
  const gap = await page.evaluate(() => {
    const note = document.querySelector('aside.margin-note').getBoundingClientRect();
    const after = document.querySelector('#after').getBoundingClientRect();
    return after.top - note.bottom;
  });
  expect(gap).toBe(lengthPx(tokens.get('--space-4')));
});
