// VF-03: version isolation (ENG-07, V3, V4, TC-B03, TC-A06). A build may hold nothing from another
// version: none of its files (the résumé or preview image, found by checksum under any name), its
// CarInfo bullets, its subline, its page title, its analytics token, its address or its Pages
// project name.
//
// Text is compared decoded and folded: Astro writes "&" as "&amp;" (plan review C5). Anything
// this version shares word for word with the other one (a common bullet) is never flagged (C9).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pdfFiles, pdfInfo, pdfText, pdfUrls } from '../lib/pdf.mjs';
import { abs, attrValues, blocks, listFiles, pages, textFiles } from '../lib/site.mjs';
import { escapeRegExp, fold, snippet } from '../lib/text.mjs';

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const norm = (s) => fold(s).toLowerCase();
/** Every file in a version folder except its settings file. */
const versionFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== 'version.json')
    .map((e) => e.name);
const hostOf = (url) => new URL(url).host.toLowerCase();
const LABEL = { bullets: 'bullet', title: 'page title', analytics: 'analytics token' };

export default {
  id: 'VF-03',
  title: 'Version isolation',
  checks: ['other-file', 'bullets', 'subline', 'title', 'analytics', 'address', 'project'],
  needsPrivate: false,
  pendable: false, // a privacy rule: never on the pending list
  run(ctx) {
    const own = ctx.version;
    const others = ctx.others ?? [];
    if (!own) throw new Error("verify needs this version's settings (ctx.version)");
    const findings = [];

    // Files, by checksum. A file this version also owns (an identical copy) is not foreign.
    const ownSums = new Set(versionFiles(own.dir).map((f) => sha(join(own.dir, f))));
    const foreign = new Map();
    for (const o of others) {
      for (const f of versionFiles(o.dir)) {
        const s = sha(join(o.dir, f));
        if (!ownSums.has(s)) foreign.set(s, `versions/${o.id}/${f}`);
      }
    }
    for (const file of listFiles(ctx)) {
      const from = foreign.get(sha(abs(ctx, file)));
      if (from) {
        findings.push({
          check: 'other-file',
          file,
          message: `is a copy of ${from}`,
          fix: 'remove it: each build gets only its own version folder (assemble-public.mjs)',
        });
      }
    }

    // Text: every text file raw, every page decoded, every PDF's text layer.
    const sources = textFiles(ctx).map(({ file, text }) => ({ file, hay: norm(text) }));
    for (const page of pages(ctx)) {
      const text = [...blocks(page.doc), ...attrValues(page.doc)].join('\n');
      sources.push({ file: page.file, hay: norm(text) });
    }
    for (const file of pdfFiles(ctx)) {
      const info = Object.values(pdfInfo(ctx, file)).join('\n');
      const text = [pdfText(ctx, file), info, ...pdfUrls(ctx, file)].join('\n');
      sources.push({ file, hay: norm(text) });
    }

    const mine = new Set(
      [own.heroSubline, own.pageTitle, own.analyticsToken, ...own.carinfoBullets].map(norm),
    );
    const needles = [];
    for (const o of others) {
      for (const b of o.carinfoBullets) {
        if (!mine.has(norm(b))) needles.push({ check: 'bullets', id: o.id, text: b, plain: true });
      }
      if (!mine.has(norm(o.heroSubline))) {
        needles.push({ check: 'subline', id: o.id, text: o.heroSubline, plain: true });
      }
      if (!mine.has(norm(o.pageTitle))) {
        needles.push({ check: 'title', id: o.id, text: o.pageTitle, plain: true });
      }
      if (!mine.has(norm(o.analyticsToken))) {
        needles.push({ check: 'analytics', id: o.id, text: o.analyticsToken, plain: true });
      }
      if (hostOf(o.siteUrl) !== hostOf(own.siteUrl)) {
        needles.push({ check: 'address', id: o.id, text: hostOf(o.siteUrl) });
      }
      if (o.pagesProject !== own.pagesProject) {
        needles.push({ check: 'project', id: o.id, text: o.pagesProject });
      }
    }
    for (const n of needles) {
      const t = norm(n.text);
      // Names and hosts must stand alone, so "pm" never matches inside another word.
      const re = n.plain ? null : new RegExp(`(?<![a-z0-9-])${escapeRegExp(t)}(?![a-z0-9-])`);
      const reported = new Set();
      for (const { file, hay } of sources) {
        if (reported.has(file) || !(re ? re.test(hay) : hay.includes(t))) continue;
        reported.add(file);
        findings.push({
          check: n.check,
          file,
          message: `holds the ${n.id} version's ${LABEL[n.check] ?? n.check}: "${snippet(n.text, 60)}"`,
          fix: `remove it: only versions/${own.id}/ may reach this build (V3, V4)`,
        });
      }
    }
    return findings;
  },
};
