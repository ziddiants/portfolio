// VF-07: stock phrases (ENG-07, T4, TC-B07). Built pages may hold no word from the design doc's
// DR-X12 list (whole word, any case), no emoji and no "!" in the text a visitor reads.
//
// - Proper nouns are left alone (DR-X12): a listed word that starts with a capital letter in the
//   middle of a sentence is a name, such as a company. Sentence case is the house style.
// - Emoji: a character with emoji presentation, a pictograph followed by U+FE0F, or a keycap.
//   ↗ (every outside link) and © are emoji in Unicode, but they show as text, so they pass (C7).
// - A résumé line that must keep a listed word (H8: word for word) is allowed only by an entry
//   in scripts/verify/allow/vf-07.json with Aditya's D-number. No inline allow switch exists.
import { readFileSync } from 'node:fs';
import { pages, readable } from '../lib/site.mjs';
import { fold, snippet } from '../lib/text.mjs';

// DR-X12, as written. "Any form" only where the list says so.
const WORDS = [
  'passionate',
  'leverag(?:e|es|ed|ing)',
  'seamless(?:ly)?',
  'cutting-edge',
  'unlock',
  'delve',
  'robust',
  'synergy',
  'game-changer',
  'revolutioni[sz]e',
  'elevate',
  'empower',
  'harness',
  'innovative',
  'world-class',
  'results-driven',
  'dynamic',
  'thought leader',
  'rockstar',
  'ninja',
  "in today's",
  'fast-paced',
  'tapestry',
];
const PHRASE = new RegExp(
  `(?<![\\p{L}\\p{N}-])(?:${WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?![\\p{L}\\p{N}-])`,
  'giu',
);
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[0-9#*]️?⃣/u;
const ALLOW_FILE = new URL('../allow/vf-07.json', import.meta.url);

/** True when the match starts a sentence, so a capital letter there does not mean a name. */
const sentenceStart = (text, index) => /(^|[.!?:]\s+|["'(]\s*)$/.test(text.slice(0, index));

export default {
  id: 'VF-07',
  title: 'Stock phrases',
  checks: ['phrases', 'emoji', 'exclamation', 'allow-list'],
  needsPrivate: false,
  run(ctx) {
    const allow = JSON.parse(readFileSync(ctx.allowVf07 ?? ALLOW_FILE, 'utf8'));
    const used = new Set();
    const isAllowed = (file, text) => {
      const i = allow.findIndex((a) => a.file === file && fold(a.text) === text);
      if (i !== -1) used.add(i);
      return i !== -1;
    };
    const findings = [];
    for (const page of pages(ctx)) {
      for (const text of readable(page)) {
        if (isAllowed(page.file, text)) continue;
        for (const m of text.matchAll(PHRASE)) {
          const proper = /^\p{Lu}/u.test(m[0]) && !sentenceStart(text, m.index);
          if (proper) continue;
          findings.push({
            check: 'phrases',
            file: page.file,
            message: `uses the stock phrase "${m[0]}" in "${snippet(text, 60)}"`,
            fix: 'rewrite the line in the content file with a concrete word (DR-X12, T4)',
          });
        }
        if (EMOJI.test(text)) {
          findings.push({
            check: 'emoji',
            file: page.file,
            message: `holds an emoji in "${snippet(text, 60)}"`,
            fix: 'remove the emoji from the content file (T4)',
          });
        }
        if (text.includes('!')) {
          findings.push({
            check: 'exclamation',
            file: page.file,
            message: `holds "!" in "${snippet(text, 60)}"`,
            fix: 'end the sentence with a full stop (DR-X12)',
          });
        }
      }
    }
    allow.forEach((a, i) => {
      if (!a.decision || !/^D\d+$/.test(a.decision)) {
        findings.push({
          check: 'allow-list',
          file: 'scripts/verify/allow/vf-07.json',
          message: `entry ${i + 1} has no decision number`,
          fix: 'every exception needs Aditya\'s D-number in "decision"',
        });
      } else if (!used.has(i)) {
        findings.push({
          check: 'allow-list',
          file: 'scripts/verify/allow/vf-07.json',
          message: `entry ${i + 1} (${a.decision}) matches no text on ${a.file}`,
          fix: 'remove the stale entry',
        });
      }
    });
    return findings;
  },
};
