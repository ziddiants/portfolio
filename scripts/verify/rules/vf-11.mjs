// VF-11: page basics (ENG-07, L5, N5, TC-B11). Every page has a lang, exactly one h1, a title, a
// description, an absolute canonical URL, the Open Graph tags (og:title, og:description, og:type,
// og:url, og:image; the URL and image absolute) and alt text on every image. An inline SVG with
// role="img" needs a name too (aria-label, aria-labelledby or a <title>).
import { attr, elements, pages, relTokens, textOf, walk } from '../lib/site.mjs';

const OG = ['og:title', 'og:description', 'og:type', 'og:url', 'og:image'];
const ABSOLUTE = /^https:\/\/[^/\s]+/i;

export default {
  id: 'VF-11',
  title: 'Page basics',
  checks: ['lang', 'h1', 'title', 'description', 'canonical', 'open-graph', 'img-alt'],
  needsPrivate: false,
  run(ctx) {
    const findings = [];
    for (const page of pages(ctx)) {
      const add = (check, message, fix) => findings.push({ check, file: page.file, message, fix });
      const metas = elements(page.doc, 'meta');
      const meta = (key) => {
        const el = metas.find((m) => (attr(m, 'property') ?? attr(m, 'name')) === key);
        return (el ? (attr(el, 'content') ?? '') : '').trim();
      };

      const html = elements(page.doc, 'html')[0];
      if (!attr(html, 'lang')?.trim())
        add('lang', 'has no lang on <html>', 'set <html lang="en"> in BaseLayout');
      const h1 = elements(page.doc, 'h1').length;
      if (h1 !== 1) add('h1', `has ${h1} h1 headings, not exactly 1`, 'give each page one h1');
      const title = elements(page.doc, 'title')[0];
      if (!title || !textOf(title)) add('title', 'has no title', 'set the page title (ERD § SEO)');
      if (!meta('description'))
        add('description', 'has no meta description', 'add one from the content entry (ERD § SEO)');
      const canonical = elements(page.doc, 'link').find((l) => relTokens(l).includes('canonical'));
      if (!ABSOLUTE.test(attr(canonical ?? {}, 'href') ?? '')) {
        add(
          'canonical',
          'has no absolute canonical link',
          'add <link rel="canonical"> with siteUrl + path',
        );
      }
      const missing = OG.filter((p) => !meta(p));
      const relative = ['og:url', 'og:image'].filter((p) => meta(p) && !ABSOLUTE.test(meta(p)));
      if (missing.length || relative.length) {
        add(
          'open-graph',
          [
            missing.length && `lacks ${missing.join(', ')}`,
            relative.length && `has a relative ${relative.join(', ')}`,
          ]
            .filter(Boolean)
            .join('; '),
          'add every Open Graph tag with absolute URLs (ERD § SEO)',
        );
      }
      for (const img of elements(page.doc, 'img')) {
        if (!attr(img, 'alt')?.trim()) {
          add(
            'img-alt',
            `has an image without alt text (${attr(img, 'src') ?? 'no src'})`,
            'add alt text that describes the image (N5)',
          );
        }
      }
      for (const svg of [...walk(page.doc)].filter(
        (n) => n.tagName === 'svg' && attr(n, 'role') === 'img',
      )) {
        const named =
          attr(svg, 'aria-label')?.trim() ||
          attr(svg, 'aria-labelledby') ||
          svg.childNodes.some((c) => c.tagName === 'title' && textOf(c));
        if (!named)
          add('img-alt', 'has an SVG image with no name', 'add a <title> or aria-label (N5)');
      }
    }
    return findings;
  },
};
