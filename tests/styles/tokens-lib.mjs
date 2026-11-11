// Reads src/styles/tokens.css for the style tests and the e2e specs (ENG-12). Nothing here is
// hard-coded from the design doc: the values come from the file under test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCss } from '../../scripts/verify/lib/css.mjs';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));
export const TOKENS_PATH = `${REPO}src/styles/tokens.css`;

/** Quotes and case do not matter to CSS here; Prettier changes both. */
export const norm = (v) => v.replace(/'/g, '"').trim().toLowerCase();

const DARK_DEVICE = ':root:not([data-theme="light"])';
const DARK_PICK = ':root[data-theme="dark"]';

/**
 * The token blocks of a tokens.css text, each as a Map(name → normalised value):
 *   base        :root, no media query (light colours, sizes, space)
 *   darkDevice  dark device, visitor has not picked Light
 *   darkPick    visitor picked Dark
 *   print       print media
 */
export function loadTokens(css = readFileSync(TOKENS_PATH, 'utf8')) {
  const { rules } = parseCss(css);
  const pick = (selector, media) => {
    const out = new Map();
    for (const r of rules) {
      const sel = r.selector.replace(/'/g, '"');
      const m = r.media.join(' ');
      if (sel === selector && m === media) {
        for (const d of r.decls) if (d.prop.startsWith('--')) out.set(d.prop, norm(d.value));
      }
    }
    return out;
  };
  return {
    base: pick(':root', ''),
    darkDevice: pick(DARK_DEVICE, '@media (prefers-color-scheme: dark)'),
    darkPick: pick(DARK_PICK, ''),
    print: pick(':root:root', '@media print'),
  };
}

export const COLOUR_TOKENS = [
  '--color-bg',
  '--color-surface',
  '--color-text',
  '--color-text-muted',
  '--color-line',
  '--color-line-strong',
  '--color-accent',
  '--color-accent-hover',
  '--color-accent-tint',
  '--color-on-accent',
];

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** #abc → #aabbcc. The build minifies #ffffff to #fff; the value is the same colour. */
export const canonHex = (v) =>
  /^#[0-9a-f]{3}$/i.test(v.trim())
    ? `#${[...v.trim().slice(1)].map((c) => c + c).join('')}`.toLowerCase()
    : v.trim().toLowerCase();

/** The computed-style form of a hex colour: "rgb(250, 248, 244)". */
export const toRgbString = (hex) => `rgb(${hexToRgb(hex).join(', ')})`;

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two hex colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pixels of a rem or px length token ("1.5rem", "44px"). */
export function lengthPx(value) {
  const m = /^(-?[\d.]+)(rem|px)$/.exec(value.trim());
  if (!m) throw new Error(`not a rem or px length: ${value}`);
  return m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
}

/** Pixels a token gives at a viewport width: a length, or clamp(Arem, Brem + Cvw, Drem). */
export function sizeAt(value, width) {
  const m = /^clamp\(\s*([\d.]+)rem,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw,\s*([\d.]+)rem\s*\)$/.exec(
    value.trim(),
  );
  if (!m) return lengthPx(value);
  const [min, base, vw, max] = [m[1] * 16, m[2] * 16, m[3], m[4] * 16];
  return Math.min(max, Math.max(min, base + (vw * width) / 100));
}

const BRAND_TOKENS = {
  bg: '--color-bg',
  text: '--color-text',
  textMuted: '--color-text-muted',
  accent: '--color-accent',
  onAccent: '--color-on-accent',
};

/**
 * Compares scripts/assets/brand.mjs with the light tokens. Returns { problems, checked }:
 * every BRAND key must map to a token and equal it, and the font stack must equal --font-sans.
 */
export function brandProblems(brand, fontSans, base) {
  const problems = [];
  let checked = 0;
  for (const key of Object.keys(brand)) {
    if (!BRAND_TOKENS[key]) problems.push(`BRAND.${key} has no token to compare with`);
  }
  for (const [key, token] of Object.entries(BRAND_TOKENS)) {
    checked++;
    if (brand[key] === undefined) problems.push(`BRAND.${key} is missing`);
    else if (canonHex(brand[key]) !== canonHex(base.get(token)))
      problems.push(`BRAND.${key} ${brand[key]} is not ${token} ${base.get(token)}`);
  }
  checked++;
  if (norm(fontSans) !== base.get('--font-sans')) problems.push('FONT_SANS is not --font-sans');
  return { problems, checked };
}
