// VF-10: outside code (ENG-07, N14, TC-B10). No script, stylesheet, font or frame from another
// origin, except Cloudflare's analytics beacon; no Astro island (client:* directives); and our
// own scripts stay at most 2,000 bytes per page (ERD § Pages, client-side rules).
//
// A client:* directive never reaches the built HTML as text: Astro turns it into an
// <astro-island> element. So the rule fails on that element, and also on a directive in src/
// (plan review C8). JSON-LD is data, not code, so it does not count as a script.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { cssSources, parseCss } from '../lib/css.mjs';
import {
  attr,
  isOutside,
  listFiles,
  localFile,
  originOf,
  pages,
  relTokens,
  sizeOf,
  walk,
} from '../lib/site.mjs';

const BEACON = 'https://static.cloudflareinsights.com';
const MAX_SCRIPT = 2000; // bytes; 1 KB = 1,000 bytes (plan review N1)
const FONT = /\.(woff2?|ttf|otf|eot)(?:[?#]|$)/i;
const DIRECTIVE = /\bclient:(load|idle|visible|media|only)\b/;
const SOURCE_EXT = new Set(['.astro', '.md', '.mdx', '.ts', '.tsx', '.js', '.jsx', '.mjs']);
const isData = (el) => /^application\/(ld\+)?json$/i.test(attr(el, 'type') ?? '');

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const go = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) go(p);
      else if (SOURCE_EXT.has(extname(e.name))) out.push(p);
    }
  };
  go(dir);
  return out;
}

export default {
  id: 'VF-10',
  title: 'Outside code',
  checks: [
    'outside-script',
    'outside-style',
    'outside-font',
    'outside-frame',
    'island',
    'client-directive',
    'script-size',
  ],
  needsPrivate: false,
  run(ctx) {
    const findings = [];
    const add = (check, file, message, fix) => findings.push({ check, file, message, fix });
    const files = new Set(listFiles(ctx));

    for (const page of pages(ctx)) {
      let bytes = 0;
      const counted = new Set();
      const countFile = (url) => {
        const f = localFile(page, url);
        if (!f || counted.has(f)) return;
        counted.add(f);
        if (!files.has(f)) {
          add(
            'script-size',
            page.file,
            `loads ${url}, which is not in the build`,
            'fix the script path',
          );
        } else bytes += sizeOf(ctx, f);
      };

      for (const el of walk(page.doc)) {
        const tag = el.tagName;
        if (tag === 'astro-island') {
          add(
            'island',
            page.file,
            'has an Astro island (a client:* directive)',
            'remove the client:* directive (N14)',
          );
        }
        if (tag === 'script') {
          const src = attr(el, 'src');
          if (src && isOutside(src)) {
            if (originOf(src) !== BEACON) {
              add(
                'outside-script',
                page.file,
                `loads a script from ${originOf(src) ?? src}`,
                'remove it: only the Cloudflare beacon may load from outside',
              );
            }
          } else if (src && /^\s*data:/i.test(src)) {
            bytes += Buffer.byteLength(src); // a data: URL is inline code by another name
          } else if (src) countFile(src);
          else if (!isData(el)) {
            bytes += Buffer.byteLength(el.childNodes.map((c) => c.value ?? '').join(''));
          }
        }
        if (tag === 'link') {
          const href = attr(el, 'href');
          const rel = relTokens(el);
          const as = (attr(el, 'as') ?? '').toLowerCase();
          if (href && isOutside(href)) {
            if (rel.includes('stylesheet') || as === 'style') {
              add(
                'outside-style',
                page.file,
                `loads a stylesheet from ${originOf(href) ?? href}`,
                'remove it: CSS comes from this site only',
              );
            } else if (FONT.test(href) || as === 'font') {
              add(
                'outside-font',
                page.file,
                `loads a font from ${originOf(href) ?? href}`,
                'remove it: system fonts only (N4)',
              );
            } else if (as === 'script' || rel.includes('modulepreload')) {
              add(
                'outside-script',
                page.file,
                `preloads a script from ${originOf(href) ?? href}`,
                'remove it',
              );
            }
          } else if (href && rel.includes('modulepreload')) countFile(href);
        }
        if (['iframe', 'frame', 'object', 'embed'].includes(tag)) {
          const src = attr(el, 'src') ?? attr(el, 'data');
          if (src && isOutside(src)) {
            add(
              'outside-frame',
              page.file,
              `embeds a ${tag} from ${originOf(src) ?? src}`,
              'link to it instead of embedding it',
            );
          }
        }
      }
      if (bytes > MAX_SCRIPT) {
        add(
          'script-size',
          page.file,
          `runs ${bytes} bytes of our own script (limit ${MAX_SCRIPT})`,
          'cut the script (ERD § Pages, client-side rules)',
        );
      }
    }

    for (const src of cssSources(ctx)) {
      const { rules, atRules } = parseCss(src.css);
      for (const at of atRules) {
        const url = /^@import\s+(?:url\()?\s*["']?([^"')\s]+)/i.exec(at.prelude)?.[1];
        if (at.name === 'import' && url && isOutside(url)) {
          add(
            'outside-style',
            src.file,
            `imports CSS from ${originOf(url) ?? url}`,
            'remove the @import',
          );
        }
      }
      for (const rule of rules) {
        for (const d of rule.decls) {
          for (const [, url] of d.value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
            if (isOutside(url) && (rule.selector === '@font-face' || FONT.test(url))) {
              add(
                'outside-font',
                src.file,
                `loads a font from ${originOf(url) ?? url}`,
                'remove it: system fonts only (N4)',
              );
            }
          }
        }
      }
    }

    for (const path of sourceFiles(join(ctx.root, 'src'))) {
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          const m = DIRECTIVE.exec(line);
          if (m) {
            findings.push({
              check: 'client-directive',
              file: relative(ctx.root, path).split(sep).join('/'),
              line: i + 1,
              message: `uses ${m[0]}`,
              fix: 'remove it: no client:* directives (N14, ERD § Pages)',
            });
          }
        });
    }
    return findings;
  },
};
