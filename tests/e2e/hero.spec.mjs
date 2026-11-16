// ENG-14: the hero on the built pages. TC-C02 and DT-04 (the first screen), TC-A08 (own subline),
// DT-03 (indigo stays rare), DT-19 (chips), DT-20 (ledger figures), DT-44 hero half (download cue)
// and the proof strip layout (D105). The expected copy is written out here on purpose: the test does
// not read it from the code under test. Résumé size is read from the page, never hard-coded
// (CI builds a stub résumé, so its size differs from a local build).
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { loadTokens, toRgbString } from '../styles/tokens-lib.mjs';
import { EYEBROW } from '../chrome/copy.mjs';
import { BASE } from './ports.mjs';

const tokens = loadTokens();
const COLOURS = { light: tokens.base, dark: tokens.darkPick };
const colour = (theme, name) => toRgbString(COLOURS[theme].get(name));

const HERO_LINE = 'I find where a product is quietly losing money, users or trust, and fix it.';
const SUBLINE = {
  payments: 'Product Manager · payments & monetization · now building with AI',
  consumer: 'Product Manager · consumer apps & monetization · now building with AI',
};
const CHIPS = [
  'Payments infrastructure',
  'Monetization & subscriptions',
  '0-to-1 product',
  'Payment routing & reconciliation',
  'Growth',
];
// [before, after, label]; "+16%" has no before value.
const STRIP = {
  payments: [
    ['45%', '63%', 'Payment success, CarInfo'],
    [null, '+16%', 'Revenue, CarInfo'],
    ['4K', '20K', 'Recurring donors, Impact Guru'],
  ],
  consumer: [
    ['45%', '63%', 'Payment success, CarInfo'],
    ['4K', '20K', 'Recurring donors, Impact Guru'],
    ['71%', '93%', 'Login completion, CarInfo'],
    ['17%', '22%', 'D1 retention, CarInfo'],
  ],
};
const IDS = ['payments', 'consumer'];
const THEMES = ['light', 'dark'];
const BUTTON = /^Résumé · PDF, \d+ KB$/;

const hero = (page) => page.locator('main > section').first();
const resumeButton = (page) => hero(page).getByRole('link', { name: BUTTON });
const figures = (page) => hero(page).locator('ul[aria-label="Results"] > li');

async function open(page, id, { width, height, theme = 'light' }) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`${BASE[id]}/`);
}

// ── TC-C02 and DT-04: the first screen ─────────────────────────────────────────────────────────
for (const id of IDS) {
  for (const theme of THEMES) {
    test(`TC-C02, DT-04: ${id}, ${theme}: eyebrow, hero line, subline and Résumé button fit in 360 × 640`, async ({
      page,
    }) => {
      await open(page, id, { width: 360, height: 640, theme });
      const h = hero(page);
      const parts = {
        eyebrow: h.locator('p').first(),
        h1: h.locator('h1'),
        subline: h.locator('p').nth(1),
        button: resumeButton(page),
      };
      expect(await resumeButton(page).count(), 'one visible Résumé button in the hero').toBe(1);
      for (const [name, el] of Object.entries(parts)) {
        const box = await el.boundingBox();
        expect(box, `${name} is on the page`).toBeTruthy();
        expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
        expect(
          box.y + box.height,
          `${name} bottom is inside the 640 px screen`,
        ).toBeLessThanOrEqual(640);
      }
      // textContent, not innerText: the eyebrow is set in capitals by CSS (text-transform).
      expect(await parts.eyebrow.textContent()).toBe(EYEBROW);
      expect(await parts.subline.innerText()).toBe(SUBLINE[id]);
    });
  }

  test(`TC-C02: ${id}: one h1 that names Aditya, then the hero line; no photo`, async ({
    page,
  }) => {
    await open(page, id, { width: 1280, height: 800 });
    expect(await page.locator('h1').count(), 'one h1 on the page (VF-11)').toBe(1);
    const text = (await hero(page).locator('h1').textContent()).replace(/ /g, ' ');
    // The hidden "Aditya Gupta: " keeps its space in the built page (a plain space survives both prettier and the build; the test proves it).
    expect(text).toBe(`Aditya Gupta: ${HERO_LINE}`);
    expect(await hero(page).locator('img, picture, svg[role="img"]').count()).toBe(0);
    // The last two words never split across lines (DR-K3).
    const lastWords = await hero(page)
      .locator('h1')
      .evaluate((h) => h.lastChild.textContent.slice(-7));
    expect(lastWords).toBe('fix it.');
  });

  test(`TC-C02: ${id}: the chips are the résumé's five domains, in order`, async ({ page }) => {
    await open(page, id, { width: 1280, height: 800 });
    const chips = await hero(page).locator('ul[aria-label="Domains"] > li').allInnerTexts();
    console.log(`${id}: ${chips.length} chips`);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips).toEqual(CHIPS);
  });

  test(`TC-A08: ${id} shows its own subline and not the other version's`, async ({ page }) => {
    await open(page, id, { width: 1280, height: 800 });
    const other = IDS.find((x) => x !== id);
    const body = await page.locator('body').innerText();
    expect(body).toContain(SUBLINE[id]);
    expect(body).not.toContain(SUBLINE[other]);
    expect(await page.locator('meta[name="viewport"]').count()).toBe(1);
  });
}

// ── DT-03: indigo stays rare ───────────────────────────────────────────────────────────────────
const parseRgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
for (const id of IDS) {
  for (const theme of THEMES) {
    for (const [width, height] of [
      [360, 640],
      [1280, 800],
    ]) {
      test(`DT-03: ${id}, ${theme}, ${width} px: accent pixels stay under the limit (7% at 360 px, 5% at 1280 px) and one element is filled`, async ({
        page,
      }) => {
        await open(page, id, { width, height, theme });
        const accent = colour(theme, '--color-accent');
        const [ar, ag, ab] = parseRgb(accent);
        const shot = await page.screenshot();
        const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
        let near = 0;
        for (let i = 0; i < data.length; i += info.channels) {
          const d =
            Math.abs(data[i] - ar) + Math.abs(data[i + 1] - ag) + Math.abs(data[i + 2] - ab);
          if (d <= 24) near++;
        }
        const share = near / (info.width * info.height);
        console.log(`${id} ${theme} ${width}: ${near} accent pixels, ${(share * 100).toFixed(2)}%`);
        expect(near, 'the primary button is accent, so there are some').toBeGreaterThan(0);
        // D107: the full-width phone button alone is 5.93%, so the phone limit is 7%; 1280 px keeps 5%.
        expect(share).toBeLessThanOrEqual(width === 360 ? 0.07 : 0.05);

        const filled = await page.evaluate(
          ({ accent, vw, vh }) => {
            let n = 0;
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > vh || r.left > vw)
                continue;
              const cs = getComputedStyle(el);
              // The hidden twin of the Résumé button is accent too, but nobody sees it.
              if (cs.visibility === 'hidden') continue;
              if (cs.backgroundColor === accent) n++;
            }
            return n;
          },
          { accent, vw: width, vh: height },
        );
        expect(filled, 'exactly one filled accent element in view').toBe(1);
      });
    }
  }
}

// ── DT-19: chips cannot be mistaken for buttons ────────────────────────────────────────────────
test('DT-19: a chip is not a link or button, is not focusable, shows a default cursor and does not react to hover', async ({
  page,
}) => {
  await open(page, 'payments', { width: 1280, height: 800 });
  const chips = hero(page).locator('ul[aria-label="Domains"] > li');
  const n = await chips.count();
  expect(n).toBe(CHIPS.length);
  const look = (el) => {
    const cs = getComputedStyle(el);
    return [
      cs.color,
      cs.backgroundColor,
      cs.borderTopColor,
      cs.textDecorationLine,
      cs.transform,
      cs.cursor,
    ];
  };
  for (let i = 0; i < n; i++) {
    const chip = chips.nth(i);
    const before = await chip.evaluate(look);
    expect(
      await chip.evaluate((el) => !!el.closest('a, button, [role="button"], [tabindex]')),
    ).toBe(false);
    expect(await chip.evaluate((el) => el.tabIndex)).toBe(-1);
    await chip.hover();
    const after = await chip.evaluate(look);
    expect(after, `chip ${i} looks the same on hover`).toEqual(before);
    expect(after[5]).toBe('default');
  }
  // Tabbing from the Contact link goes past the chips to the next focusable thing, never to a chip.
  await hero(page).getByRole('link', { name: 'Contact' }).focus();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => !!document.activeElement.closest('ul[aria-label="Domains"]')),
  ).toBe(false);
});

// ── DT-20: ledger figures read right ───────────────────────────────────────────────────────────
for (const id of IDS) {
  for (const [width, theme] of [
    [1280, 'light'],
    [1280, 'dark'],
    [320, 'light'],
  ]) {
    test(`DT-20: ${id} figures at ${width} px, ${theme}: colours, spoken phrase, one line each`, async ({
      page,
    }) => {
      await open(page, id, { width, height: 800, theme });
      const items = figures(page);
      expect(await items.count()).toBe(STRIP[id].length);
      for (const [i, [before, after, label]] of STRIP[id].entries()) {
        const li = items.nth(i);
        const value = li.locator('p').first();
        const parts = await value.evaluate((p) => {
          const c = (el) => getComputedStyle(el);
          const spans = [...p.querySelectorAll('span')];
          return {
            colours: spans.map((s) => [s.textContent.trim(), c(s).color]),
            numeric: c(p).fontVariantNumeric,
            height: p.getBoundingClientRect().height,
            fontSize: parseFloat(c(p).fontSize),
            fits: p.scrollWidth <= p.parentElement.clientWidth,
            // DR-IX13: the default arrow over a figure and its label, not the text cursor.
            cursors: [c(p).cursor, c(p.nextElementSibling).cursor],
          };
        });
        expect(await li.locator('p').nth(1).innerText()).toBe(label);
        expect(parts.numeric).toContain('tabular-nums');
        expect(parts.cursors, `${after}: default cursor over the figure and its label`).toEqual([
          'default',
          'default',
        ]);
        expect(parts.height, `${after}: one line`).toBeLessThanOrEqual(parts.fontSize * 1.25);
        expect(parts.fits, `${after} fits its column at ${width} px`).toBe(true);
        const get = (text) => parts.colours.find(([t]) => t === text)?.[1];
        if (before === null) {
          expect(get(after)).toBe(colour(theme, '--color-text'));
          expect(parts.colours.length, 'no arrow and no spoken twin').toBe(1);
        } else {
          expect(get(before)).toBe(colour(theme, '--color-text-muted'));
          expect(get('→')).toBe(colour(theme, '--color-accent'));
          expect(get(after)).toBe(colour(theme, '--color-text'));
          expect(get(`from ${before} to ${after}`), 'the spoken phrase is there').toBeTruthy();
        }
      }
      // What a screen reader gets: the phrase for a pair, and no bare arrow.
      const tree = await hero(page).locator('ul[aria-label="Results"]').ariaSnapshot();
      for (const [before, after] of STRIP[id]) {
        expect(tree).toContain(before === null ? after : `from ${before} to ${after}`);
      }
      expect(tree).not.toContain('→');
      // Exactly one spoken phrase per figure: a visible part that is not hidden would be read twice.
      for (const [i, [before, after, label]] of STRIP[id].entries()) {
        const spoken = before === null ? after : `from ${before} to ${after}`;
        await expect(figures(page).nth(i)).toMatchAriaSnapshot(
          `- listitem:\n  - /children: equal\n  - paragraph: ${JSON.stringify(spoken)}\n  - paragraph: ${JSON.stringify(label)}`,
        );
      }
    });
  }

  test(`DT-20: ${id}: selecting a figure copies "45% → 63%" only`, async ({ page }) => {
    await open(page, id, { width: 1280, height: 800 });
    const picked = await figures(page)
      .first()
      .locator('p')
      .first()
      .evaluate((p) => {
        getSelection().selectAllChildren(p);
        return getSelection().toString();
      });
    expect(picked.replace(/ /g, ' ')).toBe('45% → 63%');
  });
}

// ── The proof strip layout (D109) ──────────────────────────────────────────────────────────────
// The layout follows the width of the strip's own box, in rem, so it holds at any text size:
// below 39rem one figure per row, from 39rem two columns, from 60rem Payments is a row of three.
// Consumer's four figures stay two by two (a row of four needs about 81rem; the box is 72rem).
// Rows are the figures that share a top edge. [width, figures per row at 100% text]
const LAYOUT = {
  payments: [
    [320, [1, 1, 1]],
    [360, [1, 1, 1]],
    [600, [1, 1, 1]],
    [768, [2, 1]],
    [1099, [3]],
    [1100, [3]],
    [1280, [3]],
    [1440, [3]],
  ],
  consumer: [
    [320, [1, 1, 1, 1]],
    [360, [1, 1, 1, 1]],
    [600, [1, 1, 1, 1]],
    [768, [2, 2]],
    [1099, [2, 2]],
    [1100, [2, 2]],
    [1280, [2, 2]],
    [1440, [2, 2]],
  ],
};
const rowsOf = (page) =>
  figures(page)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    .then((tops) => {
      const found = [];
      for (const t of tops) {
        const row = found.find((r) => Math.abs(r.top - t) <= 2);
        if (row) row.n++;
        else found.push({ top: t, n: 1 });
      }
      return found.map((r) => r.n);
    });
const zoom = (page, percent) => page.addStyleTag({ content: `html { font-size: ${percent}%; }` });

for (const id of IDS) {
  for (const [width, rows] of LAYOUT[id]) {
    test(`D109: ${id} proof strip at ${width} px is ${rows.join(' + ')}`, async ({ page }) => {
      await open(page, id, { width, height: 800 });
      expect(await figures(page).count()).toBe(STRIP[id].length);
      expect(await rowsOf(page)).toEqual(rows);
    });
  }

  // The bug the cold review found (F1): a figure ran past its column between the widths that were
  // tested, and overlapped its neighbour at 125% text. Every width is checked at 100% and 125%
  // text; the narrow phone widths also at 150%, 175% and 200% (a large Android font setting, second
  // review N1, D110). The two-line label limit holds up to 125%: at 200% on 320 px a label may wrap more.
  for (const width of [320, 360, 600, 768, 1099, 1100, 1280, 1440]) {
    for (const percent of width <= 360 ? [100, 125, 150, 175, 200] : [100, 125]) {
      test(`D109: ${id} proof strip fits at ${width} px${percent > 100 ? ` with text at ${percent}%` : ''}`, async ({
        page,
      }) => {
        await open(page, id, { width, height: 800 });
        if (percent > 100) await zoom(page, percent);
        const found = await hero(page).evaluate((section, normalText) => {
          const strip = section.querySelector('ul[aria-label="Results"]');
          const stripBox = strip.getBoundingClientRect();
          const problems = [];
          let checked = 0;
          for (const li of strip.children) {
            checked++;
            const [value, label] = li.querySelectorAll('p');
            const name = value.textContent.trim().slice(0, 12);
            if (value.scrollWidth > value.clientWidth + 0.5)
              problems.push(`${name}: value runs past its column`);
            const box = li.getBoundingClientRect();
            if (box.right > stripBox.right + 0.5)
              problems.push(`${name}: column is outside the strip`);
            const lines = Math.round(
              label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight),
            );
            if (normalText && lines > 2) problems.push(`${name}: label takes ${lines} lines`);
          }
          // Neighbours in one row never overlap.
          const boxes = [...strip.children].map((li) => li.getBoundingClientRect());
          for (const [i, a] of boxes.entries()) {
            for (const b of boxes.slice(i + 1)) {
              const sameRow = Math.abs(a.top - b.top) < 2;
              if (sameRow && a.right > b.left + 0.5 && b.right > a.left + 0.5)
                problems.push('two figures overlap');
            }
          }
          // The page never scrolls sideways. Up to 125% text the hero itself does not either; at 200% on
          // 320 px the longest word of the hero line is wider than its box and runs into the page
          // margin (accepted in D110), so the hero is only held to the stricter rule at normal sizes.
          if (document.documentElement.scrollWidth > window.innerWidth + 0.5)
            problems.push('the page scrolls sideways');
          if (normalText && section.scrollWidth > section.clientWidth + 0.5)
            problems.push('the hero scrolls sideways');
          return { problems, checked };
        }, percent <= 125);
        expect(found.checked, 'figures checked').toBe(STRIP[id].length);
        expect(found.problems).toEqual([]);
        // No orphan row of one figure after a row of three (a 3 + 1 split).
        const rows = await rowsOf(page);
        const allowed = STRIP[id].length === 4 ? ['1,1,1,1', '2,2', '4'] : ['1,1,1', '2,1', '3'];
        expect(allowed, `rows ${rows.join('+')}`).toContain(rows.join(','));
      });
    }
  }
}

// ── The links and the label beside the strip ───────────────────────────────────────────────────
for (const width of [360, 1280]) {
  test(`DR-A3: the hero Contact link is a 44 px target at ${width} px`, async ({ page }) => {
    await open(page, 'payments', { width, height: 800 });
    const box = await hero(page).getByRole('link', { name: 'Contact' }).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  });
}

for (const id of IDS) {
  test(`TC-C02: ${id}: the size in the Résumé label is the size of the file the button serves`, async ({
    page,
  }) => {
    await open(page, id, { width: 1280, height: 800 });
    const label = (await resumeButton(page).innerText()).replace(/\s*↓\s*$/, '');
    const bytes = (await (await page.request.get(`${BASE[id]}/Aditya-Gupta-Resume.pdf`)).body())
      .length;
    expect(bytes, 'the file has a size').toBeGreaterThan(0);
    expect(bytes, 'the label rounds to whole KB, which holds below 1 MB').toBeLessThan(1_000_000);
    expect(label).toBe(`Résumé · PDF, ${Math.max(1, Math.round(bytes / 1000))} KB`);
  });
}

// ── DT-44, hero half: the download cue ─────────────────────────────────────────────────────────
for (const [width, bigText] of [
  [1280, false],
  [360, false],
  [1280, true],
]) {
  test(`DT-44: the hero Résumé button downloads and says so for 2 seconds at ${width} px${bigText ? ' with 25% larger text' : ''}`, async ({
    page,
  }) => {
    await open(page, 'payments', { width, height: 800 });
    if (bigText) await page.addStyleTag({ content: 'html { font-size: 125%; }' });
    const button = resumeButton(page);
    const contact = hero(page).getByRole('link', { name: 'Contact' });
    const box = (el) =>
      el.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
    const twin = hero(page).locator('a[aria-hidden="true"][download]');
    const restLabel = (await button.innerText()).replace(/\s*↓$/, '').trim();
    expect(restLabel).toMatch(BUTTON);
    const rest = { button: await box(button), contact: await box(contact), twin: await box(twin) };
    expect(rest.button.width, 'compact at rest: as wide as its own label').toBeCloseTo(
      rest.twin.width,
      0,
    );

    // The cue is on the page for 2 seconds from the click, so it is checked at once and before the
    // download event is awaited: a slow download event must not eat the time (second review N3).
    const downloaded = page.waitForEvent('download');
    const clicked = Date.now();
    await button.click();
    const busy = hero(page).getByRole('link', { name: 'Downloading', exact: true });
    await expect(busy).toBeVisible({ timeout: 1500 });
    const during = { contact: await box(contact), button: await box(busy) };
    expect(during.contact, 'Contact does not move or change size while the label shows').toEqual(
      rest.contact,
    );
    expect(during.button.left).toBeCloseTo(rest.button.left, 0);
    expect(during.button.top).toBeCloseTo(rest.button.top, 0);
    expect(during.button.height).toBeCloseTo(rest.button.height, 0);

    // It stays for about 2 seconds (still there at 1 s), then the normal label returns (N4).
    await page.waitForTimeout(Math.max(0, 1000 - (Date.now() - clicked)));
    await expect(busy).toBeVisible({ timeout: 200 });
    await expect(button).toBeVisible({ timeout: 3500 });
    expect(await box(button)).toEqual(rest.button);
    expect((await downloaded).suggestedFilename()).toBe('Aditya-Gupta-Resume.pdf');
    expect(await box(contact)).toEqual(rest.contact);
  });
}

test('DT-44: the hidden twin cannot be reached by keyboard or screen reader', async ({ page }) => {
  await open(page, 'payments', { width: 1280, height: 800 });
  const twin = hero(page).locator('a[aria-hidden="true"][download]');
  expect(await twin.count()).toBe(1);
  expect(await twin.getAttribute('tabindex')).toBe('-1');
  expect(await twin.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  expect(
    await hero(page).getByRole('link', { name: BUTTON }).count(),
    'one Résumé link in the tree',
  ).toBe(1);
});
