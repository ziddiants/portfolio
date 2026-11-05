// VF-12 tests (ENG-07, TC-B12): Payments (indexable) with a noindex fails; Consumer (not
// indexable) with a sitemap, without the noindex meta or header, or with "Disallow: /" fails.
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import vf12 from '../../scripts/verify/rules/vf-12.mjs';
import { golden } from './golden.mjs';
import { fakeVersion, ids } from './helpers.mjs';

const NOINDEX = '<meta name="robots" content="noindex" />';
const PAGES = [
  'index.html',
  'work/carinfo-payments.html',
  'work/google-pay-resolution-tracker.html',
];

/** A non-indexable build that passes VF-12: noindex on every page, the header, no sitemap. */
function consumer(change = () => {}) {
  const edit = Object.fromEntries(
    PAGES.map((p) => [p, (s) => s.replace('</head>', `${NOINDEX}</head>`)]),
  );
  const ctx = golden({
    version: fakeVersion('alpha', { indexable: false }),
    edit,
    files: { _headers: '/*\n  X-Robots-Tag: noindex\n' },
  });
  rmSync(join(ctx.distDir, 'sitemap-index.xml'));
  change(ctx.distDir);
  return ctx;
}

describe('VF-12 indexing', () => {
  test('Payments: the golden build passes; a noindex meta or header fails; no sitemap fails', () => {
    expect(vf12.run(golden())).toEqual([]);
    const meta = golden({
      edit: { 'index.html': (s) => s.replace('</head>', `${NOINDEX}</head>`) },
    });
    expect(ids(vf12.run(meta))).toEqual(['noindex index.html']);
    const header = golden({ files: { _headers: '/work/*\n  X-Robots-Tag: noindex, nofollow\n' } });
    expect(ids(vf12.run(header))).toEqual(['noindex _headers']);
    const ctx = golden();
    rmSync(join(ctx.distDir, 'sitemap-index.xml'));
    expect(ids(vf12.run(ctx))).toEqual(['sitemap']);
  });

  test('Consumer: the noindexed build passes', () => {
    expect(vf12.run(consumer())).toEqual([]);
  });

  test('Consumer: a page without the noindex meta fails', () => {
    const ctx = consumer((dir) => writeFileSync(join(dir, 'extra.html'), '<h1>No meta</h1>'));
    expect(ids(vf12.run(ctx))).toEqual(['noindex-meta extra.html']);
  });

  test('Consumer: no X-Robots-Tag for /* fails (a header on another path is not enough)', () => {
    const ctx = consumer((dir) =>
      writeFileSync(join(dir, '_headers'), '/work/*\n  X-Robots-Tag: noindex\n'),
    );
    expect(ids(vf12.run(ctx))).toEqual(['noindex-header _headers']);
  });

  test('Consumer: a sitemap fails', () => {
    const ctx = consumer((dir) => writeFileSync(join(dir, 'sitemap-0.xml'), '<urlset/>'));
    expect(ids(vf12.run(ctx))).toEqual(['no-sitemap sitemap-0.xml']);
  });

  test.each(['User-agent: *\nDisallow: /\n', 'User-agent: *\nDisallow: /*\n'])(
    'Consumer: robots.txt that blocks every crawler fails (%j)',
    (robots) => {
      const ctx = consumer((dir) => writeFileSync(join(dir, 'robots.txt'), robots));
      expect(ids(vf12.run(ctx))).toEqual(['robots-open robots.txt']);
    },
  );

  test('Consumer: no robots.txt fails; a narrow Disallow passes', () => {
    expect(ids(vf12.run(consumer((dir) => rmSync(join(dir, 'robots.txt')))))).toEqual([
      'robots-open',
    ]);
    const narrow = consumer((dir) =>
      writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /drafts/\n'),
    );
    expect(vf12.run(narrow)).toEqual([]);
  });

  test('each check applies to one kind of version only (for the D80 ratchet)', () => {
    const payments = { version: { indexable: true } };
    const other = { version: { indexable: false } };
    expect(vf12.checks.filter((c) => vf12.appliesTo(c, payments))).toEqual(['noindex', 'sitemap']);
    expect(vf12.checks.filter((c) => vf12.appliesTo(c, other))).toEqual([
      'noindex-meta',
      'noindex-header',
      'no-sitemap',
      'robots-open',
    ]);
  });
});
