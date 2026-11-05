// VF-05: source traceability (ENG-07, T3, TC-B05). Every content entry in src/content/ has a
// non-empty `sources` list, and every source ID a content file names (S-001 …) is in the private
// content-sources.md (D82). Known IDs are the first column of its tables, as the content pack's
// source register sets them out. It fails closed when the file is missing, except in CI.
//
// An entry is a Markdown file's frontmatter, a YAML file's top-level object, or each item of a
// YAML file that is a list. No content at all is a finding (content-present): until the content
// pack lands (ENG-10), that check is pending (D80).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { privateText } from '../lib/private.mjs';

const CONTENT_EXT = new Set(['.md', '.mdx', '.yaml', '.yml', '.json']);
const ID = /^S-\d{3}$/; // the content schema's own pattern (ERD § Content model)
const MENTION = /\bS-\d+\b/g; // any ID-like token in a file, valid or not

function contentFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (CONTENT_EXT.has(extname(e.name).toLowerCase())) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

function entriesOf(path, text) {
  if (/\.mdx?$/i.test(path)) {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    return [fm ? parseYaml(fm[1]) : null];
  }
  const data = /\.json$/i.test(path) ? JSON.parse(text) : parseYaml(text);
  return Array.isArray(data) ? data : [data];
}

export default {
  id: 'VF-05',
  title: 'Source traceability',
  checks: ['content-present', 'sources-present', 'sources-known'],
  needsPrivate: ['content-sources.md'],
  run(ctx) {
    const known = new Set(
      [
        ...privateText(ctx.privateDir, 'content-sources.md').matchAll(/^\s*\|\s*(S-\d{3})\s*\|/gm),
      ].map((m) => m[1]),
    );
    if (known.size === 0) {
      return [
        {
          check: 'sources-known',
          message: 'content-sources.md lists no source ID in the first column of a table',
          fix: 'copy the source register from the content pack into it (D82)',
        },
      ];
    }
    const contentDir = join(ctx.root, 'src', 'content');
    const files = contentFiles(contentDir);
    if (files.length === 0) {
      return [
        {
          check: 'content-present',
          file: 'src/content/',
          message: 'there is no content file to check',
          fix: 'import the content pack into src/content/ (ENG-10)',
        },
      ];
    }

    const findings = [];
    for (const path of files) {
      const file = relative(ctx.root, path).split(sep).join('/');
      const text = readFileSync(path, 'utf8');
      const reported = new Set(); // IDs already reported as list items, so not twice
      entriesOf(path, text).forEach((entry, i) => {
        const sources = entry && typeof entry === 'object' ? entry.sources : undefined;
        if (!Array.isArray(sources) || sources.length === 0) {
          findings.push({
            check: 'sources-present',
            file,
            message: `entry ${i + 1} has no sources`,
            fix: 'add sources: [S-…] with the IDs from content-sources.md (T3)',
          });
        }
        // Every item must be one ID from the register: "TBD", "" or "S-1234" is not a source.
        for (const item of Array.isArray(sources) ? sources : []) {
          if (typeof item === 'string' && ID.test(item) && known.has(item)) continue;
          reported.add(String(item));
          findings.push({
            check: 'sources-known',
            file,
            message: `entry ${i + 1} lists ${JSON.stringify(item)}, which is not a source ID in content-sources.md`,
            fix: 'use an S-### ID from the source register (T3)',
          });
        }
      });
      text.split(/\r?\n/).forEach((line, i) => {
        for (const [id] of line.matchAll(MENTION)) {
          if (!reported.has(id) && (!ID.test(id) || !known.has(id))) {
            findings.push({
              check: 'sources-known',
              file,
              line: i + 1,
              message: `cites ${id}, which is not in content-sources.md`,
              fix: 'use an ID from the source register, or add the source there first',
            });
          }
        }
      });
    }
    return findings;
  },
};
