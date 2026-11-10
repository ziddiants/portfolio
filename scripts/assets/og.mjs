// Renders each version's link-preview image (DS-OG): 1200 × 630 PNG, written to versions/<id>/og.png.
// Run by hand: `npm run assets:og` (all versions) or `npm run assets:og -- payments`.
// It needs Chromium (playwright-core, D96). CI has no Chromium, so the PNGs are committed and
// the output is not byte-identical on another machine (system font).
// All text is read from files: the name and subline from the version's version.json, the hero line
// from src/content/home/hero.yaml. Nothing is retyped here, and no other version's file is read.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse } from 'yaml';
import { listVersions, loadVersion } from '../../versions/load.mjs';
import { BRAND, FONT_SANS } from './brand.mjs';
import { markSvg } from './mark.mjs';
import { isMain } from './is-main.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// sha256 of the page each committed og.png was rendered from (see ogInputHash). CI has no Chromium and
// cannot read the pixels, so a test compares this file with the current texts and template instead.
export const INPUTS_FILE = join(ROOT, 'scripts/assets/og-inputs.json');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The three texts for one version. The name is the part of pageTitle before the first " · ". */
export function ogTexts(id) {
  const settings = loadVersion(id);
  const hero = parse(readFileSync(join(ROOT, 'src/content/home/hero.yaml'), 'utf8')).find(
    (e) => e.id === 'hero',
  );
  const name = settings.pageTitle.split(' · ')[0];
  if (!name || !hero?.heroLine || !settings.heroSubline) {
    throw new Error(`og: missing name, hero line or subline for version "${id}"`);
  }
  return { name, heroLine: hero.heroLine, subline: settings.heroSubline };
}

/** The template (DS-OG). 80 px margins, name top left, hero line, subline, rule, mark. */
export function ogHtml({ name, heroLine, subline }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body {
    width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px; box-sizing: border-box; padding: 80px;
    background: ${BRAND.bg}; color: ${BRAND.text}; font-family: ${FONT_SANS};
    display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
  }
  .name { font-size: 40px; font-weight: 600; line-height: 1.2; }
  .hero { font-size: 64px; font-weight: 600; line-height: 1.08; letter-spacing: -0.022em; text-wrap: balance; margin: 0; }
  .subline { font-size: 28px; line-height: 1.4; color: ${BRAND.textMuted}; margin: 24px 0 0; }
  .foot { display: flex; align-items: flex-end; justify-content: space-between; }
  .rule { width: 120px; height: 2px; background: ${BRAND.accent}; margin-bottom: 27px; }
  .mark { width: 56px; height: 56px; display: block; }
</style></head><body>
  <div class="name">${esc(name)}</div>
  <div><p class="hero">${esc(heroLine)}</p><p class="subline">${esc(subline)}</p></div>
  <div class="foot"><div class="rule"></div><div class="mark">${markSvg()}</div></div>
</body></html>`;
}

/**
 * sha256 of the exact HTML a version's preview is rendered from: its texts and the template.
 * If a subline, the hero line, the name or the template changes and the PNG is not re-rendered,
 * this no longer matches the value saved by `npm run assets:og`, and a test fails.
 */
export function ogInputHash(id) {
  return createHash('sha256')
    .update(ogHtml(ogTexts(id)))
    .digest('hex');
}

async function launch() {
  const { chromium } = await import('playwright-core');
  try {
    return await chromium.launch();
  } catch (err) {
    throw new Error(
      `og: Chromium did not start (${err.message.split('\n')[0]}). playwright-core 1.63.0 needs Chromium build 1243 (D96); set PLAYWRIGHT_BROWSERS_PATH if it is not in the default cache.`,
    );
  }
}

/** Renders one page. Text that does not fit the image is an error: it would be cut off in silence. */
async function shoot(browser, texts, label) {
  const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } });
  try {
    await page.setContent(ogHtml(texts));
    const fit = await page.evaluate(() => {
      const body = document.body;
      const hero = document.querySelector('.hero');
      const lineHeight = parseFloat(getComputedStyle(hero).lineHeight);
      return {
        fits: body.scrollWidth <= body.clientWidth && body.scrollHeight <= body.clientHeight,
        heroLines: Math.round(hero.getBoundingClientRect().height / lineHeight),
      };
    });
    if (!fit.fits)
      throw new Error(`og: the text does not fit the ${OG_WIDTH} × ${OG_HEIGHT} image (${label})`);
    if (fit.heroLines > 3)
      throw new Error(`og: the hero line needs ${fit.heroLines} lines; DS-OG allows 3 (${label})`);
    const shot = await page.screenshot({ type: 'png' });
    // palette PNG: flat colours and text keep it far below 150 KB; sharp drops all metadata
    return await sharp(shot).png({ palette: true, effort: 10 }).toBuffer();
  } finally {
    await page.close();
  }
}

/** Renders a preview from given texts (used by the tests to try text that is too long). */
export async function renderOgFromTexts(texts) {
  const browser = await launch();
  try {
    return await shoot(browser, texts, 'given texts');
  } finally {
    await browser.close();
  }
}

/** Renders one PNG buffer per id with one shared browser. */
export async function renderOgBuffers(ids) {
  const browser = await launch();
  try {
    const out = {};
    for (const id of ids) out[id] = await shoot(browser, ogTexts(id), `version "${id}"`);
    return out;
  } finally {
    await browser.close();
  }
}

if (isMain(import.meta.url)) {
  const ids = process.argv.length > 2 ? process.argv.slice(2) : listVersions();
  const buffers = await renderOgBuffers(ids);
  for (const id of ids) {
    const { dir, ogImage } = loadVersion(id);
    writeFileSync(join(dir, ogImage), buffers[id]);
    console.log(`versions/${id}/${ogImage}  ${buffers[id].length} bytes`);
  }
  // remember what each PNG was rendered from; keys sorted so the file does not churn
  const saved = existsSync(INPUTS_FILE) ? JSON.parse(readFileSync(INPUTS_FILE, 'utf8')) : {};
  for (const id of ids) saved[id] = ogInputHash(id);
  const sorted = Object.fromEntries(Object.entries(saved).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(INPUTS_FILE, JSON.stringify(sorted, null, 2) + '\n');
  console.log('scripts/assets/og-inputs.json updated');
}
