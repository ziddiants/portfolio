// VF-13: outside links (ENG-07, L3, TC-B13). Every link to another site carries
// rel="noopener noreferrer" and the outside-link marker of DS-CMP-04: the ↗ mark and the hidden
// text "(opens in a new tab)". mailto: links and links to this version's own address are not
// outside links.
import { attr, elements, isOutside, originOf, pages, relTokens, textOf } from '../lib/site.mjs';

const HIDDEN_TEXT = '(opens in a new tab)';

export default {
  id: 'VF-13',
  title: 'Outside links',
  checks: ['rel', 'marker'],
  needsPrivate: false,
  run(ctx) {
    const own = ctx.version ? originOf(ctx.version.siteUrl) : null;
    const findings = [];
    for (const page of pages(ctx)) {
      for (const a of elements(page.doc, 'a')) {
        const href = attr(a, 'href');
        if (!isOutside(href) || originOf(href) === own) continue;
        const rel = relTokens(a);
        if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
          findings.push({
            check: 'rel',
            file: page.file,
            message: `links to ${href} without rel="noopener noreferrer"`,
            fix: 'use the ExternalLink component (ERD § Components)',
          });
        }
        const text = textOf(a);
        if (!text.includes('↗') || !text.includes(HIDDEN_TEXT)) {
          findings.push({
            check: 'marker',
            file: page.file,
            message: `links to ${href} without the ↗ mark and "${HIDDEN_TEXT}"`,
            fix: 'use the ExternalLink component (DS-CMP-04, L3)',
          });
        }
      }
    }
    return findings;
  },
};
