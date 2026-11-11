// ENG-13: the page chrome on the built pages. Header and nav (DT-12, DT-13 part), mobile menu
// (DT-18, TC-C11), theme button (DT-37), no flash (DT-38), no JavaScript (DT-40 part), the
// section highlight (DT-41), the skip link, the footer and the script budget (VF-10, seam 2).
// The strings are in tests/chrome/copy.mjs; copy.test.mjs compares them with the design doc.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { REPO, loadTokens, toRgbString } from '../styles/tokens-lib.mjs';
import {
  DOWNLOADING,
  FOOTER_RE,
  MENU,
  MENU_CLOSE,
  NAME,
  NAV,
  RESUME,
  RESUME_HREF,
  RESUME_FILE,
  SKIP,
  THEME_LABEL,
  THEME_SCRIPT,
  TITLE_TO_DARK,
  TITLE_TO_LIGHT,
  firstInHead,
  fold,
} from '../chrome/copy.mjs';
import { BASE } from './ports.mjs';

const tokens = loadTokens();
const LIGHT = tokens.base;
const DARK = tokens.darkPick;
const bg = (theme) => toRgbString((theme === 'dark' ? DARK : LIGHT).get('--color-bg'));
const HOME = `${BASE.payments}/`;
const FIXTURE_HOME = `${BASE.fixture}/`;
const DIST = process.env.E2E_DIST_ROOT || join(REPO, 'dist');

const header = (page) => page.locator('header.site-header');
const themeButton = (page) => page.getByRole('button', { name: THEME_LABEL, exact: true });
const menuButton = (page) => page.getByRole('button', { name: /^(Menu|Close)$/ });
const marked = (page) => header(page).locator('[aria-current="true"]');
const dataTheme = (page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const htmlBg = (page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

// ── The links, the strings, both versions ──────────────────────────────────────────────────────
for (const id of ['payments', 'consumer']) {
  test(`DT-36: ${id} header, nav, skip link and footer carry the fixed strings`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE[id]}/`);
    await expect(page.getByRole('link', { name: NAME, exact: true })).toHaveAttribute('href', '/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toHaveCount(1);
    for (const [name, href] of NAV) {
      await expect(nav.getByRole('link', { name, exact: true }), name).toHaveAttribute(
        'href',
        href,
      );
    }
    await expect(nav.getByRole('link')).toHaveCount(NAV.length + 2); // + the name link, + Résumé
    const resume = nav.getByRole('link', { name: RESUME, exact: true });
    await expect(resume).toHaveAttribute('href', RESUME_HREF);
    await expect(resume).toHaveAttribute('download', '');
    await expect(page.getByRole('link', { name: SKIP, exact: true })).toHaveAttribute(
      'href',
      '#content',
    );
    const footer = page.getByRole('contentinfo');
    await expect(footer).toHaveCount(1);
    const text = fold(await footer.textContent());
    expect(text, text).toMatch(FOOTER_RE);
    const [, day, month, year] = FOOTER_RE.exec(text);
    const built = new Date(`${day} ${month} ${year} 12:00 UTC`);
    expect(
      Math.abs(Date.now() - built.getTime()),
      'the footer date is the build date',
    ).toBeLessThan(3 * 86_400_000);
  });
}

// ── DT-12, DT-13: header height, where the nav and the menu switch ─────────────────────────────
for (const [width, height, desktop] of [
  [360, 56, false],
  [1099, 56, false],
  [1100, 64, true],
  [1280, 64, true],
]) {
  test(`DT-12/DT-13: at ${width} px the header is ${height} px and shows the ${desktop ? 'full nav' : 'menu button'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto(HOME);
    const box = await header(page).boundingBox();
    expect(box.height).toBe(height);
    expect(box.width, 'the header spans the window').toBeGreaterThanOrEqual(width - 20);
    await expect(themeButton(page)).toBeVisible();
    const theme = await themeButton(page).boundingBox();
    expect([theme.width, theme.height]).toEqual([44, 44]);
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const [name] of NAV) {
      await expect(nav.getByRole('link', { name, exact: true }), name).toBeVisible({
        visible: desktop,
      });
    }
    await expect(nav.getByRole('link', { name: RESUME, exact: true })).toBeVisible({
      visible: desktop,
    });
    await expect(menuButton(page)).toBeVisible({ visible: !desktop });
    // The header is one row: nothing wraps below it, and nothing runs past the window.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

for (const width of [360, 1280]) {
  test(`DR-IX2: the header stays at the top while the page scrolls at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 400 });
    await page.goto(HOME);
    await page.evaluate(() => window.scrollTo(0, 300));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    expect((await header(page).boundingBox()).y).toBe(0);
    expect(await header(page).evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  });
}

for (const [width, viaMenu] of [
  [1280, false],
  [360, true],
]) {
  test(`DT-12: each nav link lands with the section label below the header at ${width} px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // no smooth scroll to wait for
    await page.setViewportSize({ width, height: 600 });
    let landed = 0;
    for (const [name, href] of NAV) {
      await page.goto(HOME);
      if (viaMenu) await menuButton(page).click();
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${href.slice(1)}$`));
      const at = await page.evaluate((id) => {
        const label = document.querySelector(`#${id} .label`).getBoundingClientRect();
        return {
          gap:
            label.top - document.querySelector('header.site-header').getBoundingClientRect().bottom,
          scrolled: scrollY,
          end: innerHeight + scrollY >= document.documentElement.scrollHeight - 1,
        };
      }, href.slice(2));
      // The jump scrolled the page (a jump that did nothing would leave the label far below).
      expect(at.scrolled, `${name}: the page scrolled`).toBeGreaterThan(0);
      expect(at.gap, `${name}: label top minus header bottom`).toBeGreaterThanOrEqual(0);
      // Close under the header (scroll-margin-top 24 px + the section's hairline and padding),
      // unless the page ended first: the last sections cannot go any higher.
      if (!at.end) expect(at.gap, `${name}: not far below the header`).toBeLessThanOrEqual(80);
      landed += 1;
    }
    expect(landed).toBe(NAV.length);
  });
}

// ── Found by the cold review (11 Nov) ──────────────────────────────────────────────────────────
test('WCAG 1.4.10, 2.4.11: in a short window every menu link can be reached and seen', async ({
  page,
}) => {
  // A phone turned sideways: 740 x 360. The panel is taller than the window.
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto(HOME);
  const button = menuButton(page);
  await button.click();
  const panel = page.locator('#' + (await button.getAttribute('aria-controls')));
  const box = await panel.boundingBox();
  expect(box.y + box.height, 'the panel ends inside the window').toBeLessThanOrEqual(360);
  expect(
    await panel.evaluate((el) => el.scrollHeight > el.clientHeight),
    'the premise: the links do not all fit, so the panel must scroll',
  ).toBe(true);
  // Tab to the last link (Résumé): it must end up inside the window.
  await button.focus();
  for (let n = 0; n < NAV.length + 1; n += 1) await page.keyboard.press('Tab');
  const last = panel.getByRole('link', { name: RESUME, exact: true });
  await expect(last).toBeFocused();
  const at = await last.boundingBox();
  expect(at.y).toBeGreaterThanOrEqual(56);
  expect(at.y + at.height).toBeLessThanOrEqual(360);
});

test('a closed menu panel cannot be clicked while it fades out', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(HOME);
  await menuButton(page).click();
  const panelId = await menuButton(page).getAttribute('aria-controls');
  await page.keyboard.press('Escape');
  const during = await page
    .locator('#' + panelId)
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(during).toBe('none');
  await menuButton(page).click();
  const open = await page
    .locator('#' + panelId)
    .evaluate((el) => getComputedStyle(el).pointerEvents);
  expect(open, 'an open panel takes clicks').not.toBe('none');
});

test('DT-41: a page whose sections fit the window marks by the 40% line, not the page end', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 3200 }); // the whole page fits
  await page.goto(HOME);
  const at = await page.evaluate(() => {
    const line = innerHeight * 0.4;
    const sections = [...document.querySelectorAll('main > section[id]')];
    const want = sections.filter((s) => s.getBoundingClientRect().top <= line).at(-1)?.id ?? null;
    return {
      fits: document.documentElement.scrollHeight <= innerHeight,
      contactTop: document.getElementById('contact').getBoundingClientRect().top,
      line,
      want,
    };
  });
  expect(at.fits, 'the premise: the page does not scroll').toBe(true);
  expect(at.contactTop, 'the premise: Contact is below the line').toBeGreaterThan(at.line);
  expect(at.want, 'some section is above the line').toBeTruthy();
  await expect(marked(page)).toHaveCount(1);
  await expect(marked(page)).toHaveAttribute('href', `/#${at.want}`);
});

// ── DT-44: the Résumé download cue (D101) ──────────────────────────────────────────────────────
for (const [width, viaMenu] of [
  [1280, false],
  [360, true],
]) {
  test(`DT-44: pressing Résumé downloads the file and the label says so for 2 seconds at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(HOME);
    if (viaMenu) await menuButton(page).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    const resume = nav.getByRole('link', { name: RESUME, exact: true });
    // What a visitor can see in the header: each link or button with its box.
    const boxes = () =>
      header(page)
        .locator('a, button')
        .evaluateAll((els) =>
          els
            .filter(
              (el) =>
                el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
            )
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                id: el.getAttribute('href') ?? el.className,
                left: r.left,
                right: r.right,
                top: r.top,
                height: r.height,
              };
            }),
        );
    const split = (all) => ({
      resume: all.find((b) => b.id === RESUME_HREF),
      others: all.filter((b) => b.id !== RESUME_HREF),
    });
    const before = split(await boxes());
    expect(before.others.length, 'the other links and buttons are counted').toBeGreaterThan(3);
    expect(before.resume, 'the Résumé button is on screen').toBeTruthy();

    const started = Date.now();
    const [download] = await Promise.all([page.waitForEvent('download'), resume.click()]);
    expect(download.suggestedFilename()).toBe(RESUME_FILE);
    const busy = nav.getByRole('link', { name: DOWNLOADING, exact: true });
    await expect(busy).toBeVisible();
    const during = split(await boxes());
    expect(during.others, 'nothing beside the button moves or changes size').toEqual(before.others);
    expect(during.resume.right, 'the button keeps its right edge').toBeCloseTo(
      before.resume.right,
      0,
    );
    if (viaMenu) {
      // A full-width row in the menu: same box. The menu stays open to show the label.
      expect(during.resume).toEqual(before.resume);
      await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    } else {
      // In the bar the button is only as wide as its label: it grows to the left into room kept
      // free for it, and never touches the theme button. (A button pre-widened for the longer
      // label would look empty at rest.)
      expect(during.resume.left).toBeLessThan(before.resume.left - 20);
      const theme = await themeButton(page).boundingBox();
      expect(during.resume.left).toBeGreaterThanOrEqual(theme.x + theme.width);
      expect(
        before.resume.right - before.resume.left,
        'idle width: label, arrow, padding',
      ).toBeLessThan(140);
    }

    await expect(nav.getByRole('link', { name: RESUME, exact: true })).toBeVisible({
      timeout: 4000,
    });
    const shown = Date.now() - started;
    expect(shown, `the label showed for ${shown} ms`).toBeGreaterThanOrEqual(1800);
    expect(shown).toBeLessThanOrEqual(3500);
    expect(split(await boxes())).toEqual(before);
  });
}

// ── DT-18, TC-C11: the phone menu ──────────────────────────────────────────────────────────────
test.describe('mobile menu at 360 px', () => {
  test.use({ viewport: { width: 360, height: 700 } });

  test('DT-18: closed, open, Esc, a chosen link, a tap outside; focus returns to the button', async ({
    page,
  }) => {
    await page.goto(HOME);
    const button = page.getByRole('button', { name: MENU, exact: true });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const panelId = await button.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = page.locator(`#${panelId}`);
    await expect(panel, 'the panel the button controls exists').toHaveCount(1);
    await expect(panel).toBeHidden();
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await button.click();
    const close = page.getByRole('button', { name: MENU_CLOSE, exact: true });
    await expect(close).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    const links = panel.getByRole('link');
    await expect(links).toHaveCount(NAV.length + 1);
    // By accessible name, in order, down the page (textContent would also read the hidden label).
    const ys = [];
    for (const name of [...NAV.map(([n]) => n), RESUME]) {
      const link = panel.getByRole('link', { name, exact: true });
      await expect(link, name).toHaveCount(1);
      ys.push((await link.boundingBox()).y);
    }
    expect(ys, 'the links run down the panel in order').toEqual([...ys].sort((a, b) => a - b));
    const rows = await panel
      .locator('li')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(
      rows.slice(0, NAV.length).every((h) => h >= 47.5 && h <= 49),
      String(rows),
    ).toBe(true);
    const panelBox = await panel.boundingBox();
    expect(panelBox.y, 'the panel opens below the header').toBeGreaterThanOrEqual(56);

    // Esc closes and returns focus.
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();

    // Choosing a link closes the menu, returns focus and goes to the section.
    await button.click();
    await panel.getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(/#contact$/);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();

    // A tap outside closes it.
    await button.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(180, 650);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();
  });

  test('TC-C11: every section is reachable from the menu by keyboard', async ({ page }) => {
    let reached = 0;
    for (const [i, [name, href]] of NAV.entries()) {
      await page.goto(HOME);
      await menuButton(page).focus();
      await page.keyboard.press('Enter');
      for (let n = 0; n <= i; n += 1) await page.keyboard.press('Tab');
      await expect(
        page
          .locator('#' + (await menuButton(page).getAttribute('aria-controls')))
          .getByRole('link', {
            name,
            exact: true,
          }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new RegExp(`${href.slice(1)}$`));
      reached += 1;
    }
    expect(reached).toBe(NAV.length);
  });

  test('DR-IX6: the page behind the open menu still scrolls and focus is not trapped', async ({
    page,
  }) => {
    await page.goto(HOME);
    await menuButton(page).click();
    const before = await page.evaluate(() => scrollY);
    await page.mouse.move(180, 650);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    // Eight panel links (the seven sections and Résumé), then the next Tab leaves the header.
    for (let n = 0; n < 9; n += 1) await page.keyboard.press('Tab');
    // The focus is out of the header: it is not trapped in the menu.
    expect(await page.evaluate(() => document.activeElement.closest('header') === null)).toBe(true);
  });
});

// ── DT-37: the theme button ────────────────────────────────────────────────────────────────────
for (const device of ['light', 'dark']) {
  test(`DT-37: with the device ${device}, each press flips the theme; it survives a reload and another page`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: device });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(FIXTURE_HOME);
    const button = themeButton(page);
    const other = device === 'light' ? 'dark' : 'light';
    const state = async (theme) => {
      await expect(button, `pressed in ${theme}`).toHaveAttribute(
        'aria-pressed',
        String(theme === 'dark'),
      );
      await expect(button).toHaveAttribute(
        'title',
        theme === 'dark' ? TITLE_TO_LIGHT : TITLE_TO_DARK,
      );
      expect(await htmlBg(page)).toBe(bg(theme));
      // The icon shows the theme you will get: a moon in light, a sun in dark.
      await expect(button.locator(theme === 'dark' ? '.sun' : '.moon')).toBeVisible();
      await expect(button.locator(theme === 'dark' ? '.moon' : '.sun')).toBeHidden();
    };
    await state(device);
    expect(await dataTheme(page), 'no pick yet').toBeNull();

    await button.click(); // mouse
    await state(other);
    expect(await dataTheme(page)).toBe(other);
    await page.reload();
    await state(other);
    await page.goto(`${BASE.fixture}/fixture`);
    await state(other);

    await themeButton(page).focus();
    await page.keyboard.press('Enter'); // keyboard
    await state(device);
    await page.keyboard.press('Space');
    await state(other);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(other);
  });
}

test('DT-37: with storage blocked the button still works and nothing throws', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(FIXTURE_HOME);
  await themeButton(page).click();
  expect(await dataTheme(page)).toBe('dark');
  expect(await htmlBg(page)).toBe(bg('dark'));
  await themeButton(page).click();
  expect(await dataTheme(page)).toBe('light');
  expect(errors).toEqual([]);
});

test('DS-CMP-22: both theme-color metas follow the pick', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${BASE.fixture}/fixture`);
  const metas = () =>
    page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => e.content));
  // The script writes the computed colour of <html>: rgb(), the same colour as the token.
  const hex = (theme) => toRgbString((theme === 'dark' ? DARK : LIGHT).get('--color-bg'));
  expect((await metas()).length, 'the fixture has two theme-color metas').toBe(2);
  expect(await metas()).toEqual([hex('light'), hex('light')]);
  await themeButton(page).click();
  expect(await metas()).toEqual([hex('dark'), hex('dark')]);
  await themeButton(page).click();
  expect(await metas()).toEqual([hex('light'), hex('light')]);
});

test('DS-CMP-22: with Dark saved and the device light, the metas are dark at load', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto(`${BASE.fixture}/fixture`);
  const metas = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((els) => els.map((e) => e.content));
  expect(metas.length, 'the fixture has two theme-color metas').toBe(2);
  expect(metas).toEqual([toRgbString(DARK.get('--color-bg')), toRgbString(DARK.get('--color-bg'))]);
  await expect(themeButton(page)).toHaveAttribute('aria-pressed', 'true');
});

// ── DT-38: no flash of the wrong theme ─────────────────────────────────────────────────────────
for (const id of ['payments', 'consumer']) {
  test(`DT-38: the theme script is the first element in the ${id} <head>, with the doc text`, async ({
    request,
  }) => {
    const html = await (await request.get(`${BASE[id]}/`)).text();
    const first = firstInHead(html);
    expect(first.tag).toBe('script');
    expect(first.attrs, 'no src, no type: a plain inline script').toBe('');
    expect(fold(first.text)).toBe(THEME_SCRIPT);
    expect(Buffer.byteLength(first.text)).toBeLessThan(1024);
  });
}

test('DT-38: device light, saved Dark: the page is dark when the document is parsed', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'dark');
    } catch {
      /* blocked */
    }
    document.addEventListener('DOMContentLoaded', () => {
      window.__atParse = getComputedStyle(document.documentElement).backgroundColor;
    });
  });
  await page.goto(HOME);
  expect(await page.evaluate(() => window.__atParse)).toBe(bg('dark'));
  expect(await dataTheme(page)).toBe('dark');
});

// ── DT-40: no JavaScript ───────────────────────────────────────────────────────────────────────
for (const width of [360, 1280]) {
  test.describe(`no JavaScript at ${width} px`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width, height: 800 } });

    test('DT-40: every link is reachable, the menu is a list, the buttons are hidden', async ({
      page,
    }) => {
      await page.goto(HOME);
      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const [name, href] of NAV) {
        const link = nav.getByRole('link', { name, exact: true });
        await expect(link, name).toBeVisible();
        await expect(link).toHaveAttribute('href', href);
      }
      await expect(nav.getByRole('link', { name: RESUME, exact: true })).toBeVisible();
      await expect(themeButton(page)).toBeHidden();
      await expect(menuButton(page)).toBeHidden();
      const position = await header(page).evaluate((el) => getComputedStyle(el).position);
      // A tall list must not stay stuck on a phone; the one-row desktop header does.
      expect(position).toBe(width === 360 ? 'static' : 'sticky');
      // The menu panel is a plain list in the page flow on a phone (it is display:none from 1100).
      const panel = await page.locator('#site-menu').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { position: cs.position, display: cs.display };
      });
      expect(panel).toEqual(
        width === 360
          ? { position: 'static', display: 'block' }
          : { position: 'static', display: 'none' },
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        'layout unbroken',
      ).toBeLessThanOrEqual(width);
    });

    test('DT-40: the theme follows the device', async ({ page }) => {
      for (const device of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: device });
        await page.goto(HOME);
        expect(await htmlBg(page)).toBe(bg(device));
      }
    });
  });
}

// ── DT-41: the nav shows where you are ─────────────────────────────────────────────────────────
test.describe('section highlight', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });
  // The placeholder page is short. A tall first block (the hero will be one) keeps the first section
  // below the 40% line at the top, and room at the end lets the last sections reach it.
  const room = (page) =>
    page.evaluate(() => {
      document.querySelector('main > section').style.paddingBottom = '60vh';
      document.querySelector('main').style.paddingBottom = '150vh';
    });
  const scrollSection = (page, id, at) =>
    page.evaluate(
      ([sid, fraction]) => {
        const top = document.getElementById(sid).getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top - innerHeight * fraction);
      },
      [id, at],
    );

  test('DT-41: at 1280 exactly one link is marked, the one of the section past 40%', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(HOME);
    await room(page);
    expect(await marked(page).count(), 'nothing is marked on the first screen').toBe(0);
    let checked = 0;
    for (const [name, href] of NAV) {
      await scrollSection(page, href.slice(2), 0.3);
      await expect(marked(page)).toHaveCount(1);
      await expect(marked(page)).toHaveAttribute('href', href);
      await expect(marked(page)).toHaveText(name);
      checked += 1;
    }
    expect(checked).toBe(NAV.length);
    // Back up: the previous section takes the mark again (a scroll up crosses the same line).
    await scrollSection(page, 'about', 0.3);
    await expect(marked(page)).toHaveAttribute('href', '/#about');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(marked(page)).toHaveCount(0);
  });

  test('DT-41: at the very end of the page the last section is marked, though its top never passes 40%', async ({
    page,
  }) => {
    // No extra room here: the page is as built, in a tall window (what a visitor sees).
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(HOME);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const at = await page.evaluate(() => ({
      top: document.getElementById('contact').getBoundingClientRect().top,
      line: innerHeight * 0.4,
      scrolled: scrollY,
      end: innerHeight + scrollY >= document.documentElement.scrollHeight - 1,
    }));
    // The premise: the page scrolls, it is at its end, and Contact's top is still below the line.
    expect(at.scrolled).toBeGreaterThan(0);
    expect(at.end).toBe(true);
    expect(at.top).toBeGreaterThan(at.line);
    await expect(marked(page)).toHaveCount(1);
    await expect(marked(page)).toHaveAttribute('href', '/#contact');
    // A little way up, the end is left and the mark follows the 40% line again.
    await page.evaluate(() => window.scrollBy(0, -300));
    await expect(marked(page)).toHaveCount(1);
    await expect(marked(page)).not.toHaveAttribute('href', '/#contact');
  });

  test('DT-41: the line is at 40% of the window: 45% is not past it, 35% is', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(HOME);
    await room(page);
    await scrollSection(page, 'about', 0.3);
    await expect(marked(page)).toHaveAttribute('href', '/#about');
    await scrollSection(page, 'experience', 0.45);
    await expect(marked(page)).toHaveAttribute('href', '/#about');
    await scrollSection(page, 'experience', 0.35);
    await expect(marked(page)).toHaveAttribute('href', '/#experience');
  });

  test('DT-41: the mark has no animation and no sliding indicator', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(HOME);
    const durations = [];
    for (const [name] of NAV) {
      durations.push(
        await header(page)
          .getByRole('link', { name, exact: true })
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      );
    }
    expect(durations).toHaveLength(NAV.length);
    expect(new Set(durations)).toEqual(new Set(['0s']));
    await room(page);
    await scrollSection(page, 'work', 0.3);
    await expect(marked(page)).toHaveCount(1);
    const style = await marked(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        color: cs.color,
        thickness: cs.textDecorationThickness,
        line: cs.textDecorationLine,
        decoColor: cs.textDecorationColor,
        animations: document.getAnimations().length,
      };
    });
    expect(style.line).toContain('underline');
    expect(style.thickness).toBe('2px');
    expect(style.color).toBe(toRgbString(LIGHT.get('--color-text')));
    expect(style.decoColor).toBe(toRgbString(LIGHT.get('--color-accent')));
    expect(style.animations).toBe(0);
  });

  test('DT-41: at 360 no link a visitor can see is marked, in the bar or in the open menu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    await page.goto(HOME);
    await room(page);
    for (const [, href] of NAV) {
      await scrollSection(page, href.slice(2), 0.3);
      await page.waitForTimeout(150);
      await menuButton(page).click();
      await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
      expect(await marked(page).filter({ visible: true }).count(), href).toBe(0);
      // Control: the script works at 360 (it marks the hidden desktop link), so "none visible" is
      // a fact about what a visitor sees and not a broken script.
      expect(await marked(page).count(), `${href}: one link is marked, out of sight`).toBe(1);
      await menuButton(page).click();
    }
  });

  test('DS-CMP-01: a case-study or project page marks its own nav item (the fixture is "Work")', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE.fixture}/fixture`);
    // The fixture has an element with id="about": the script must not take it for the home section
    // and clear the mark the markup gave. Give its observers time to report.
    await page.waitForTimeout(400);
    // The nav list and the menu panel are both marked; only the one on screen is seen.
    await expect(marked(page)).toHaveCount(2);
    await expect(marked(page).filter({ visible: true })).toHaveCount(1);
    await expect(marked(page).filter({ visible: true })).toHaveAttribute('href', '/#work');
    await page.setViewportSize({ width: 360, height: 700 });
    await menuButton(page).click();
    await expect(marked(page).filter({ visible: true })).toHaveCount(1);
  });
});

// ── The skip link ──────────────────────────────────────────────────────────────────────────────
test('DS-CMP-20: the skip link is the first stop, shows on focus, and moves the keyboard into the content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE.fixture}/fixture`);
  const skip = page.getByRole('link', { name: SKIP, exact: true });
  const hidden = await skip.boundingBox();
  expect(Math.max(hidden.width, hidden.height), 'hidden until focused').toBeLessThanOrEqual(1);
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  const shown = await skip.boundingBox();
  expect(shown.width).toBeGreaterThan(60);
  expect(shown.x).toBeGreaterThanOrEqual(0);
  expect(shown.y).toBeGreaterThanOrEqual(0);
  const look = await skip.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  });
  expect(look.bg).toBe(toRgbString(LIGHT.get('--color-accent-tint')));
  expect(look.color).toBe(toRgbString(LIGHT.get('--color-text')));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#content$/);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.closest('main') !== null)).toBe(true);
});

// ── The scripts: one small file, only the theme script inline (VF-10, ENG-23) ──────────────────
for (const id of ['payments', 'consumer']) {
  test(`VF-10: ${id} ships one external script and one inline theme script, together under 1,650 bytes`, async ({}, testInfo) => {
    const dir = join(DIST, id);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    const inline = scripts.filter(([, attrs]) => !/\ssrc=/.test(attrs));
    const external = scripts.filter(([, attrs]) => /\ssrc=/.test(attrs));
    expect(
      inline.map(([, a]) => a.trim()),
      'one inline script, and it is not a module',
    ).toEqual(['']);
    expect(fold(inline[0][2])).toBe(THEME_SCRIPT);
    expect(external).toHaveLength(1);
    const src = /src="([^"]+)"/.exec(external[0][1])[1];
    expect(src).toMatch(/^\/_astro\/.+\.js$/);
    const file = statSync(join(dir, src));
    const total = Buffer.byteLength(inline[0][2]) + file.size;
    testInfo.annotations.push({
      type: 'bytes',
      description: `inline ${Buffer.byteLength(inline[0][2])} + file ${file.size} = ${total}`,
    });
    expect(file.size).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(1650);
    // No other script file in the build (a stray file would be a second request).
    const js = readdirSync(join(dir, '_astro')).filter((f) => f.endsWith('.js'));
    expect(js).toHaveLength(1);
  });
}

test('the head check can fail: a head that starts with a meta is caught', () => {
  const bad = '<head><meta charset="utf-8"><script>try{}catch(e){}</script></head>';
  expect(firstInHead(bad).tag).not.toBe('script');
});
