// Renders each version's link-preview image (DS-OG): 1200 × 630 PNG, written to versions/<id>/og.png.
// Run by hand: `npm run assets:og` (all versions) or `npm run assets:og -- payments`.
// It needs Chromium (playwright-core, D96). CI has no Chromium, so the PNGs are committed and
// the output is not byte-identical on another machine (system font).
// All text is read from files: the name and subline from the version's version.json, the hero line
// from src/content/home/hero.yaml. Nothing is retyped here, and no other version's file is read.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse } from 'yaml';
import { listVersions, loadVersion } from '../../versions/load.mjs';
import { BRAND, FONT_SANS } from './brand.mjs';
import { markSvg } from './mark.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

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

/** Renders one PNG buffer per id with one shared browser. */
export async function renderOgBuffers(ids) {
  const { chromium } = await import('playwright-core');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    throw new Error(
      `og: Chromium did not start (${err.message.split('\n')[0]}). playwright-core 1.63.0 needs the Chromium build 1243 in ~/Library/Caches/ms-playwright (D96).`,
    );
  }
  try {
    const out = {};
    for (const id of ids) {
      const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } });
      await page.setContent(ogHtml(ogTexts(id)));
      const shot = await page.screenshot({ type: 'png' });
      await page.close();
      // palette PNG: flat colours and text keep it far below 150 KB; sharp drops all metadata
      out[id] = await sharp(shot).png({ palette: true, effort: 10 }).toBuffer();
    }
    return out;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ids = process.argv.length > 2 ? process.argv.slice(2) : listVersions();
  const buffers = await renderOgBuffers(ids);
  for (const id of ids) {
    const { dir, ogImage } = loadVersion(id);
    writeFileSync(join(dir, ogImage), buffers[id]);
    console.log(`versions/${id}/${ogImage}  ${buffers[id].length} bytes`);
  }
}
