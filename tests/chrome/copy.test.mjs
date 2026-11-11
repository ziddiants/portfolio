// ENG-13 copy checks (DT-36 part): the chrome strings in tests/chrome/copy.mjs match design-brand.md,
// and the theme-script text matches the doc. The doc is in the private vault: CI skips these.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { privateDir } from '../../scripts/verify/lib/private.mjs';
import * as C from './copy.mjs';

const docPath = join(privateDir(), '..', 'design-brand.md');
const hasDoc = existsSync(docPath);
if (!hasDoc) console.log(`chrome: ${docPath} not found; the design-doc comparisons are skipped`);

describe.skipIf(!hasDoc)('chrome copy equals design-brand.md', () => {
  const doc = hasDoc ? readFileSync(docPath, 'utf8') : '';
  const strings = Object.fromEntries(
    doc
      .slice(doc.indexOf('| Where | String | Notes |'))
      .split('\n\n')[0]
      .split('\n')
      .slice(2)
      .map((l) => {
        const c = l.split('|').map((x) => x.trim());
        return [c[1], c[2]];
      }),
  );

  test('the rows exist (count > 0)', () => {
    expect(Object.keys(strings).length).toBeGreaterThan(10);
  });
  test.each([
    ['Header', `"${C.NAME}"`],
    ['Header button', `"${C.RESUME}" + ↓`],
    ['Mobile menu button', `"${C.MENU}" / "${C.MENU_CLOSE}"`],
    ['Skip link', `"${C.SKIP}"`],
    ['Download button after a click', `"${C.DOWNLOADING}"`],
    ['Footer', '"© 2026 Aditya Gupta · Updated {d Mon yyyy}"'],
  ])('%s', (where, want) => {
    expect(strings[where]).toBe(want);
  });
  test('the theme button label and the two tooltips', () => {
    const cell = strings['Header theme button'];
    expect(cell).toContain(`aria-label "${C.THEME_LABEL}"`);
    expect(cell).toContain(`tooltip "${C.TITLE_TO_DARK}" / "${C.TITLE_TO_LIGHT}"`);
  });
  test('the nav names and anchors', () => {
    const table = doc
      .slice(doc.indexOf('| Nav link | Section label | Section h2'))
      .split('\n\n')[0]
      .split('\n')
      .slice(2)
      .map((l) => l.split('|').map((c) => c.trim().replace(/`/g, '')));
    expect(table).toHaveLength(7);
    expect(table.map((c) => [c[1], `/${c[4]}`])).toEqual(C.NAV);
  });
  test('the theme script text is the doc text', () => {
    const block = /<script is:inline>([\s\S]*?)<\/script>/.exec(
      doc.slice(doc.indexOf('## Engineering handoff')),
    );
    expect(block, 'the doc holds the theme script').not.toBeNull();
    expect(C.fold(block[1])).toBe(C.THEME_SCRIPT);
  });
});

describe('firstInHead', () => {
  test('sees the first element of <head>', () => {
    expect(C.firstInHead('<html><head><script>x</script><meta charset="utf-8"></head>')).toEqual({
      tag: 'script',
      attrs: '',
      text: 'x',
    });
  });
  test('can fail: a page with the meta first is not a theme-script-first page', () => {
    const got = C.firstInHead('<head><meta charset="utf-8"><script>x</script></head>');
    expect(got.tag).toBe('meta');
  });
  test('an empty head gives null', () => {
    expect(C.firstInHead('<html><body></body></html>')).toBeNull();
  });
});
