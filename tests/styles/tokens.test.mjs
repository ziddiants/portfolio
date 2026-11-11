// Style tests (ENG-12): TC-F02 / DT-02 (contrast), tokens.css and base.css against the design
// doc, brand.mjs against tokens.css, the section copy against the design doc, formatSize (DT-22).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseCss } from '../../scripts/verify/lib/css.mjs';
import { BRAND, FONT_SANS } from '../../scripts/assets/brand.mjs';
import { SECTIONS } from '../../src/lib/sections.ts';
import { downloadLabel, formatSize } from '../../src/lib/format-size.ts';
import {
  assertFigure,
  assertOutsideHref,
  assertSectionNumber,
  assertSourceId,
} from '../../src/lib/guards.ts';
import { privateDir } from '../../scripts/verify/lib/private.mjs';
import {
  COLOUR_TOKENS,
  REPO,
  TOKENS_PATH,
  brandProblems,
  canonHex,
  contrast,
  loadTokens,
  norm,
} from './tokens-lib.mjs';

const tokens = loadTokens();

// The design doc § Colour table: [text token, background token, light ratio, dark ratio, bar].
const PAIRS = [
  ['--color-text', '--color-bg', 16.24, 15.46, 7],
  ['--color-text', '--color-surface', 15.0, 14.19, 7],
  ['--color-text-muted', '--color-bg', 6.67, 7.21, 4.5],
  ['--color-text-muted', '--color-surface', 6.16, 6.62, 4.5],
  ['--color-accent', '--color-bg', 5.45, 6.56, 4.5],
  ['--color-accent', '--color-surface', 5.03, 6.02, 4.5],
  ['--color-accent', '--color-accent-tint', 4.97, 5.28, 4.5],
  ['--color-on-accent', '--color-accent', 5.78, 6.56, 4.5],
  ['--color-on-accent', '--color-accent-hover', 7.55, 9.02, 4.5],
  ['--color-line-strong', '--color-bg', 3.31, 3.36, 3.0],
];

describe('TC-F02 / DT-02: every token pair meets WCAG AA in both themes', () => {
  test('all colour tokens exist in the light, dark and print blocks', () => {
    for (const [name, block] of [
      ['light', tokens.base],
      ['dark (device)', tokens.darkDevice],
      ['dark (pick)', tokens.darkPick],
      ['print', tokens.print],
    ]) {
      expect(
        COLOUR_TOKENS.filter((t) => !block.has(t)),
        name,
      ).toEqual([]);
    }
  });

  test('20 pairs: each is at or above its bar and equals the number in the design doc', () => {
    let checked = 0;
    for (const [theme, block, col] of [
      ['light', tokens.base, 2],
      ['dark', tokens.darkPick, 3],
    ]) {
      for (const pair of PAIRS) {
        const [fg, bg, , , bar] = pair;
        const ratio = contrast(canonHex(block.get(fg)), canonHex(block.get(bg)));
        expect(ratio, `${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(bar);
        expect(Math.abs(ratio - pair[col]), `${theme} ${fg} on ${bg} vs doc`).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBe(20);
  });

  test('print: black on white keeps the text pairs above the bar', () => {
    const p = tokens.print;
    expect(
      contrast(canonHex(p.get('--color-text')), canonHex(p.get('--color-bg'))),
    ).toBeGreaterThan(7);
    expect(
      contrast(canonHex(p.get('--color-text-muted')), canonHex(p.get('--color-bg'))),
    ).toBeGreaterThan(4.5);
  });

  test('the two dark blocks are identical, as the file says they must be', () => {
    const device = [...tokens.darkDevice.entries()].map(([k, v]) => [k, canonHex(v)]).sort();
    const pick = COLOUR_TOKENS.map((k) => [k, canonHex(tokens.darkPick.get(k))]).sort();
    expect(device).toHaveLength(10);
    expect(device).toEqual(pick);
  });
});

describe('brand.mjs equals tokens.css (ENG-11 carry-over)', () => {
  test('the five colours and the font stack match the light tokens', () => {
    const { problems, checked } = brandProblems(BRAND, FONT_SANS, tokens.base);
    expect(checked).toBe(6);
    expect(problems).toEqual([]);
  });

  test('a changed colour is caught (one fault, one problem)', () => {
    const { problems } = brandProblems({ ...BRAND, accent: '#4F55DA' }, FONT_SANS, tokens.base);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('BRAND.accent');
  });

  test('a changed font stack, a missing key and an unmapped key are caught', () => {
    expect(brandProblems(BRAND, 'serif', tokens.base).problems).toHaveLength(1);
    const { text, ...missing } = BRAND;
    expect(brandProblems(missing, FONT_SANS, tokens.base).problems).toHaveLength(1);
    expect(
      brandProblems({ ...BRAND, extra: '#000000' }, FONT_SANS, tokens.base).problems,
    ).toHaveLength(1);
  });
});

// The design doc lives in the private vault; CI has none, so these skip there (printed).
const docPath = join(privateDir(), '..', 'design-brand.md');
const hasDoc = existsSync(docPath);
if (!hasDoc) console.log(`styles: ${docPath} not found; the design-doc comparisons are skipped`);

/** Rules and at-rules with quotes and hex case normalised, for comparing two CSS texts. */
function shape(css) {
  const { rules, atRules } = parseCss(css);
  const v = (x) => canonHex(norm(x));
  return {
    rules: rules.map((r) => ({
      selector: r.selector.replace(/'/g, '"').replace(/\s+/g, ' '),
      media: r.media.map((m) => m.replace(/\s+/g, ' ')),
      decls: r.decls.map((d) => ({ prop: d.prop, value: v(d.value) })),
    })),
    atRules: atRules.map((a) => a.prelude.replace(/\s+/g, ' ')),
  };
}

describe.skipIf(!hasDoc)('copied as is from design-brand.md § Engineering handoff', () => {
  const doc = hasDoc ? readFileSync(docPath, 'utf8') : '';
  const blocks = [
    ...doc.slice(doc.indexOf('## Engineering handoff')).matchAll(/```css\n([\s\S]*?)```/g),
  ];

  test('the doc holds the two CSS blocks', () => {
    expect(blocks).toHaveLength(2);
  });

  test.each([
    ['tokens.css', 0, TOKENS_PATH],
    ['base.css', 1, join(REPO, 'src', 'styles', 'base.css')],
  ])('%s has the same rules as the doc (Prettier may re-wrap and re-case)', (_, i, path) => {
    const ours = shape(readFileSync(path, 'utf8'));
    expect(ours.rules.length).toBeGreaterThan(5);
    expect(ours).toEqual(shape(blocks[i][1]));
  });

  test('a changed value would be caught', () => {
    const changed = readFileSync(TOKENS_PATH, 'utf8').replace(
      '--space-4: 1rem',
      '--space-4: 1.1rem',
    );
    expect(changed).not.toBe(readFileSync(TOKENS_PATH, 'utf8'));
    expect(shape(changed)).not.toEqual(shape(blocks[0][1]));
  });

  test('the section copy matches § Interface copy (nav, label, h2, anchor)', () => {
    const table = doc
      .slice(doc.indexOf('| Nav link | Section label | Section h2'))
      .split('\n\n')[0];
    const rows = table
      .split('\n')
      .slice(2)
      .map((l) =>
        l
          .split('|')
          .map((c) => c.trim().replace(/`/g, ''))
          .slice(1, -1),
      );
    expect(rows).toHaveLength(7);
    expect(SECTIONS.map((s) => [s.nav, `${s.number} ${s.name}`, s.heading, `#${s.id}`])).toEqual(
      rows,
    );
  });
});

describe('DT-22: file sizes in download labels', () => {
  test.each([
    [118_400, '118 KB'],
    [1, '1 KB'],
    [999_499, '999 KB'],
    [999_500, '1.0 MB'],
    [1_100_000, '1.1 MB'],
    [3_100_000, '3.1 MB'],
  ])('%i bytes → %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text);
  });

  test('a size that is not a positive number is an error, not "NaN KB"', () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(() => formatSize(bad)).toThrow();
  });

  test('the label reads "Résumé · PDF, 118 KB"', () => {
    expect(downloadLabel('Résumé', 'PDF', 118_400)).toBe('Résumé · PDF, 118 KB');
  });
});

describe('component input checks stop the build on one bad input each', () => {
  test('ExternalLink: only outside addresses', () => {
    expect(() => assertOutsideHref('https://example.org')).not.toThrow();
    for (const bad of ['/work', 'mailto:a@b.co', 'example.org', 'javascript:alert(1)'])
      expect(() => assertOutsideHref(bad), bad).toThrow(/ExternalLink/);
  });
  test('MarginNote: S- and three digits', () => {
    expect(() => assertSourceId('S-014')).not.toThrow();
    for (const bad of ['S-14', 's-014', 'S-0144', ' S-014', 'X-014'])
      expect(() => assertSourceId(bad), bad).toThrow(/MarginNote/);
  });
  test('SectionHeader: 01 to 07', () => {
    for (const ok of ['01', '07']) expect(() => assertSectionNumber(ok)).not.toThrow();
    for (const bad of ['00', '08', '1', '001', 'A1'])
      expect(() => assertSectionNumber(bad), bad).toThrow(/SectionHeader/);
  });
  test('Figure: caption, alt text, and a diagram slot, one at a time', () => {
    const ok = { caption: 'Look here.', hasImage: true, alt: 'A screen.', hasSlot: false };
    expect(() => assertFigure(ok)).not.toThrow();
    expect(() => assertFigure({ ...ok, hasImage: false, hasSlot: true })).not.toThrow();
    expect(() => assertFigure({ ...ok, caption: '  ' })).toThrow(/caption/);
    expect(() => assertFigure({ ...ok, alt: '' })).toThrow(/alt text/);
    expect(() => assertFigure({ ...ok, alt: undefined })).toThrow(/alt text/);
    expect(() => assertFigure({ ...ok, hasImage: false })).toThrow(/src or a diagram/);
  });
});
