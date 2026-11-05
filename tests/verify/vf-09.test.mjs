// VF-09 tests (ENG-07, TC-B09): gradients, blur(), shadows, motion, hover transforms, big radii,
// raw colours outside the tokens and off-scale breakpoints fail, in .css files, <style> blocks and
// style="" alike, and in the forms Lightning CSS writes (range media queries, named colours).
import { describe, expect, test } from 'vitest';
import { parseCss } from '../../scripts/verify/lib/css.mjs';
import vf09, { minWidths } from '../../scripts/verify/rules/vf-09.mjs';
import { golden } from './golden.mjs';
import { tempDir } from './helpers.mjs';

const css = (text) => golden({ files: { '_astro/extra.css': text } });
const checksOf = (found) => found.map((f) => f.check).sort();

describe('VF-09 visual rules', () => {
  test.each([
    ['gradient', '.a{background:linear-gradient(red,blue)}'],
    [
      'gradient',
      '.a{background-image:repeating-radial-gradient(var(--color-bg),var(--color-text))}',
    ],
    ['blur', '.a{filter:blur(4px)}'],
    ['backdrop-filter', '.a{-webkit-backdrop-filter:none}'],
    ['shadow', '.a{text-shadow:0 0 1px var(--color-text)}'],
    ['shadow', '.a{box-shadow:none}'],
    ['shadow', '.a{filter:drop-shadow(0 1px 2px var(--color-text))}'],
    ['keyframes', '@keyframes spin{to{opacity:0}}'],
    ['animation', '.a{animation-duration:1s}'],
    ['hover-transform', '.a:hover{transform:translateY(-2px)}'],
    ['hover-transform', '@media (hover:hover){.card{&:hover{scale:1.02}}}'],
    ['radius', '.a{border-radius:12px}'],
    ['radius', '.a{border-top-left-radius:1rem}'],
    ['radius', '.a{border-radius:50%}'],
    ['radius', ':root{--radius-pill:9999px}'],
    ['raw-colour', '.a{color:#123456}'],
    ['raw-colour', '.a{color:red}'],
    ['raw-colour', '.a{border-color:rgb(0 0 0/.5)}'],
    ['raw-colour', '.a{color:oklch(70% .1 200)}'],
    ['raw-colour', ':root{--brand:#ff0000}'],
    ['breakpoint', '@media (min-width:900px){.a{margin:0}}'],
    ['breakpoint', '@media (width>=1000px){.a{margin:0}}'],
    ['breakpoint', '@media (40em<=width){.a{margin:0}}'],
  ])('%s: %s fails', (check, text) => {
    const found = vf09.run(css(text));
    expect(checksOf(found)).toContain(check);
    expect(found.every((f) => f.file === '_astro/extra.css')).toBe(true);
  });

  test('CSS in a <style> block or a style="" attribute is checked too', () => {
    const ctx = golden({
      edit: {
        'index.html': (s) =>
          s
            .replace('</head>', '<style>.x{color:#000}</style></head>')
            .replace('<h1>', '<h1 style="box-shadow:0 1px red">'),
      },
    });
    expect(checksOf(vf09.run(ctx))).toEqual(['raw-colour', 'raw-colour', 'shadow']);
  });

  test('a radius through a token is resolved: 6px passes, 12px fails', () => {
    expect(vf09.run(css(':root{--r:6px}.a{border-radius:var(--r)}'))).toEqual([]);
    expect(checksOf(vf09.run(css(':root{--r:12px}.a{border-radius:var(--r)}')))).toEqual([
      'radius',
    ]);
  });

  test('tokens, transparent, currentcolor, url(#id), tan() and data: URLs pass', () => {
    const ok =
      '.a{color:var(--color-text);border-color:currentcolor;background:transparent url(#grad)}' +
      '.b{rotate:tan(1deg);background-image:url("data:image/svg+xml;utf8,<svg fill=\'%23fff\'/>")}' +
      '@media (min-width:600px) and (width<1100px){.c{margin:0}}@media (min-width:90em){.d{margin:0}}';
    expect(vf09.run(css(ok))).toEqual([]);
  });

  test('without src/styles/tokens.css, a raw colour in any custom property fails', () => {
    // The golden CSS holds four: --color-bg, --color-text, --color-accent and the dark --color-bg.
    const found = vf09.run(golden({ root: tempDir() }));
    expect(checksOf(found)).toEqual(Array(4).fill('raw-colour'));
  });

  test("the design doc's handoff CSS passes (ENG-12 copies it as it is)", () => {
    const handoff = `:root{--color-bg:#faf8f4;--color-text:#1a1a1a}
@media (min-width:768px){:root{--page-gutter:2rem}}@media (min-width:1100px){:root{--header-h:4rem}}
@media (prefers-reduced-motion:reduce){:root{--duration-fast:0ms}}
@media print{:root:root{--color-bg:#ffffff}}
a{transition:color var(--duration-fast) var(--ease-out)}@media (hover:hover){a:hover{color:var(--color-accent-hover)}}`;
    expect(vf09.run(css(handoff))).toEqual([]);
  });

  test('min-width forms, and the parser keeps strings, nesting and media together', () => {
    expect(minWidths('(min-width: 48em) and (width >= 1100px) or (37.5rem <= width)')).toEqual([
      768, 1100, 600,
    ]);
    const { rules, atRules } = parseCss('@media (hover:hover){.a{b:url("x;y");&:hover{c:d}}}');
    expect(atRules.map((a) => a.name)).toEqual(['media']);
    expect(rules).toEqual([
      {
        selector: '.a &:hover',
        media: ['@media (hover:hover)'],
        decls: [{ prop: 'c', value: 'd' }],
      },
      {
        selector: '.a',
        media: ['@media (hover:hover)'],
        decls: [{ prop: 'b', value: 'url("x;y")' }],
      },
    ]);
  });
});
