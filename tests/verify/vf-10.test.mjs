// VF-10 tests (ENG-07, TC-B10): an outside script, a web font, an iframe, an Astro island, a
// client:load directive and a 3 KB script fail; the Cloudflare beacon and JSON-LD pass.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import vf10 from '../../scripts/verify/rules/vf-10.mjs';
import { golden, ROOT } from './golden.mjs';
import { buildDir, ids } from './helpers.mjs';

const inHead = (html, extra = {}) =>
  golden({ edit: { 'index.html': (s) => s.replace('</head>', `${html}</head>`) }, ...extra });
const BEACON =
  '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"t"}\'></script>';

describe('VF-10 outside code', () => {
  test.each([
    ['outside-script', '<script src="https://cdn.example.com/x.js"></script>'],
    ['outside-script', '<script src="//cdn.example.com/x.js"></script>'],
    ['outside-script', '<link rel="modulepreload" href="https://cdn.example.com/m.js">'],
    [
      'outside-style',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
    ],
    ['outside-font', '<link rel="preload" as="font" href="https://fonts.gstatic.com/a.woff2">'],
    ['outside-frame', '<iframe src="https://www.youtube.com/embed/x"></iframe>'],
    ['island', '<astro-island uid="1" component-url="/_astro/C.js" client="load"></astro-island>'],
  ])('%s fails: %s', (check, html) => {
    expect(ids(vf10.run(inHead(html)))).toEqual([`${check} index.html`]);
  });

  test('a web font through CSS fails (@font-face and @import)', () => {
    const ctx = golden({
      files: {
        '_astro/fonts.css':
          '@import url("https://fonts.googleapis.com/css2?family=Inter");' +
          '@font-face{font-family:X;src:url(https://fonts.gstatic.com/x.woff2)}',
      },
    });
    expect(ids(vf10.run(ctx))).toEqual([
      'outside-font _astro/fonts.css',
      'outside-style _astro/fonts.css',
    ]);
  });

  test('a client:load directive in src/ fails, with its line', () => {
    const root = buildDir(ROOT);
    mkdirSync(join(root, 'src', 'components'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'components', 'Menu.astro'),
      '---\n---\n<Counter client:load />\n',
    );
    expect(vf10.run(golden({ root }))).toMatchObject([
      { check: 'client-directive', file: 'src/components/Menu.astro', line: 3 },
    ]);
  });

  test('a 3 KB inline script or a 3 KB bundled script fails; a missing script fails', () => {
    const big = 'x'.repeat(3000);
    expect(ids(vf10.run(inHead(`<script>/*${big}*/</script>`)))).toEqual([
      'script-size index.html',
    ]);
    const bundled = inHead('<script type="module" src="/_astro/menu.js"></script>', {
      files: { '_astro/menu.js': `/*${big}*/` },
    });
    expect(ids(vf10.run(bundled))).toEqual(['script-size index.html']);
    const missing = vf10.run(inHead('<script type="module" src="/_astro/gone.js"></script>'));
    expect(missing[0].message).toBe('loads /_astro/gone.js, which is not in the build');
  });

  test('F12: a data: script counts as our own code', () => {
    const src = `data:text/javascript,${'x'.repeat(3000)}`;
    expect(ids(vf10.run(inHead(`<script src="${src}"></script>`)))).toEqual([
      'script-size index.html',
    ]);
  });

  test('the Cloudflare beacon, JSON-LD and a small own script pass', () => {
    const data = `<script type="application/ld+json">${JSON.stringify({ x: 'y'.repeat(3000) })}</script>`;
    expect(vf10.run(inHead(`${BEACON}${data}<script>let a = 1;</script>`))).toEqual([]);
  });
});
