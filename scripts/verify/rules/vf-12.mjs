// VF-12: indexing (ENG-07, L6, D59, TC-B12). The indexable version (Payments) carries no noindex
// and has a sitemap. Every other version has the noindex meta on every page and the X-Robots-Tag
// header for /*, has no sitemap, and its robots.txt does not block crawlers (a blocked crawler
// never sees the noindex). Checks apply by version, so the pending ratchet (D80) only asks for
// the checks of the version it is looking at.
import { readFileSync } from 'node:fs';
import { abs, attr, elements, listFiles, pages } from '../lib/site.mjs';

const FOR_INDEXABLE = ['noindex', 'sitemap'];

/** _headers as [{ path, headers: [{ name, value }] }]. */
export function parseHeaders(text) {
  const blocks = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) blocks.push({ path: line.trim(), headers: [] });
    else {
      const m = /^\s+([^:]+):\s*(.*)$/.exec(line);
      if (m && blocks.length) blocks.at(-1).headers.push({ name: m[1].trim(), value: m[2].trim() });
    }
  }
  return blocks;
}
const noindexHeader = (h) => h.name.toLowerCase() === 'x-robots-tag' && /noindex/i.test(h.value);
const metaNoindex = (page) =>
  elements(page.doc, 'meta').some(
    (m) =>
      /^(robots|googlebot)$/i.test(attr(m, 'name') ?? '') &&
      /noindex/i.test(attr(m, 'content') ?? ''),
  );

export default {
  id: 'VF-12',
  title: 'Indexing',
  checks: ['noindex', 'sitemap', 'noindex-meta', 'noindex-header', 'no-sitemap', 'robots-open'],
  needsPrivate: false,
  appliesTo: (check, ctx) => FOR_INDEXABLE.includes(check) === Boolean(ctx.version?.indexable),
  run(ctx) {
    const v = ctx.version;
    if (!v) throw new Error("verify needs this version's settings (ctx.version)");
    const files = listFiles(ctx);
    const read = (f) => (files.includes(f) ? readFileSync(abs(ctx, f), 'utf8') : null);
    const headers = parseHeaders(read('_headers') ?? '');
    const findings = [];
    const add = (check, file, message, fix) => findings.push({ check, file, message, fix });

    if (v.indexable) {
      for (const page of pages(ctx)) {
        if (metaNoindex(page))
          add(
            'noindex',
            page.file,
            'carries a noindex meta on the indexed site',
            'remove it (D59)',
          );
      }
      if (headers.some((b) => b.headers.some(noindexHeader))) {
        add(
          'noindex',
          '_headers',
          'sends X-Robots-Tag: noindex on the indexed site',
          'remove it (D59)',
        );
      }
      if (!files.includes('sitemap-index.xml')) {
        add(
          'sitemap',
          '',
          'has no sitemap-index.xml',
          'keep @astrojs/sitemap on for indexable versions',
        );
      }
      return findings;
    }

    for (const page of pages(ctx)) {
      if (!metaNoindex(page))
        add(
          'noindex-meta',
          page.file,
          'lacks <meta name="robots" content="noindex">',
          'add it for non-indexed versions (ENG-22)',
        );
    }
    if (!headers.some((b) => b.path === '/*' && b.headers.some(noindexHeader))) {
      add(
        'noindex-header',
        '_headers',
        'does not send X-Robots-Tag: noindex for /*',
        'write it in write-headers.mjs (ENG-23)',
      );
    }
    for (const f of files.filter((f) => /(^|\/)sitemap[^/]*\.xml$/i.test(f))) {
      add(
        'no-sitemap',
        f,
        'is a sitemap on a version that must not be indexed',
        'turn the sitemap off when indexable is false',
      );
    }
    const robots = read('robots.txt');
    if (robots === null)
      add('robots-open', '', 'has no robots.txt', 'write one that allows crawlers (ENG-22)');
    else if (/^\s*disallow:\s*\/\*?\s*$/im.test(robots)) {
      add(
        'robots-open',
        'robots.txt',
        'blocks every crawler, so none will see the noindex',
        'allow crawlers; noindex keeps the site out of search (ENG-22)',
      );
    }
    return findings;
  },
};
