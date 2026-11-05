// VF-15: weight (ENG-07, N1, TC-B15). The home page's HTML, plus the CSS, scripts and images it
// loads, stays at most 300,000 bytes; no image in the build is over 150,000 bytes. Raw bytes are
// counted (1 KB = 1,000 bytes), which is stricter than the compressed transfer; TC-G01 measures
// the real transfer later (ENG-26). For an image with srcset, its largest file is counted.
import { attr, listFiles, localFile, pages, relTokens, sizeOf, walk } from '../lib/site.mjs';

const MAX_HOME = 300_000;
const MAX_IMAGE = 150_000;
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;
const srcsetUrls = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);

export default {
  id: 'VF-15',
  title: 'Weight',
  checks: ['home-weight', 'image-size'],
  needsPrivate: false,
  run(ctx) {
    const files = new Set(listFiles(ctx));
    const findings = [];
    const home = pages(ctx).find((p) => p.file === 'index.html');
    if (!home) {
      findings.push({
        check: 'home-weight',
        file: 'index.html',
        message: 'the home page is missing',
        fix: 'check the build',
      });
    } else {
      const parts = new Map([['index.html', sizeOf(ctx, 'index.html')]]);
      const take = (urls) => {
        const local = urls.map((u) => [u, localFile(home, u)]).filter(([, f]) => f);
        for (const [u, f] of local) {
          if (!files.has(f)) {
            findings.push({
              check: 'home-weight',
              file: 'index.html',
              message: `loads ${u}, which is not in the build`,
              fix: 'fix the path',
            });
          }
        }
        const present = local.map(([, f]) => f).filter((f) => files.has(f));
        if (present.length === 0) return;
        const biggest = present.reduce((a, b) => (sizeOf(ctx, a) >= sizeOf(ctx, b) ? a : b));
        parts.set(biggest, sizeOf(ctx, biggest));
      };
      for (const el of walk(home.doc)) {
        if (
          el.tagName === 'link' &&
          relTokens(el).some((r) => r === 'stylesheet' || r === 'modulepreload')
        )
          take([attr(el, 'href')]);
        if (el.tagName === 'script' && attr(el, 'src')) take([attr(el, 'src')]);
        if (el.tagName === 'img')
          take([attr(el, 'src'), ...srcsetUrls(attr(el, 'srcset'))].filter(Boolean));
        if (el.tagName === 'source') take(srcsetUrls(attr(el, 'srcset')));
      }
      const total = [...parts.values()].reduce((a, b) => a + b, 0);
      if (total > MAX_HOME) {
        const top = [...parts]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([f, n]) => `${f} ${n}`)
          .join(', ');
        findings.push({
          check: 'home-weight',
          file: 'index.html',
          message: `the home page loads ${total} bytes (limit ${MAX_HOME}); largest: ${top}`,
          fix: 'compress or cut the largest files (N1)',
        });
      }
    }
    for (const f of files) {
      if (IMAGE.test(f) && sizeOf(ctx, f) > MAX_IMAGE) {
        findings.push({
          check: 'image-size',
          file: f,
          message: `is ${sizeOf(ctx, f)} bytes (limit ${MAX_IMAGE})`,
          fix: 'compress or resize it (ERD § Assets)',
        });
      }
    }
    return findings;
  },
};
