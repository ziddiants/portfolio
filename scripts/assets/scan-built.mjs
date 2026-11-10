// TC-G04 (N4), automatic half: scans a built folder for font requests and for images without a size.
//   1. No font files shipped, no @font-face, no <link rel="preload" as="font">, no url() of a font file.
//   2. Every <img> has a positive whole-number width and height (no layout shift).
// Not covered here: "with images blocked, all text renders". That needs a page that uses images
// (ENG-19, ENG-20), where a browser test runs it.
// Usage: node scripts/assets/scan-built.mjs <built folder>...   Exit 1 if any problem is found.
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { parse } from 'parse5';
import { isMain } from './is-main.mjs';

const FONT_EXT = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);
// A font loaded from another site is still a font request (N4: no font downloads).
const FONT_HOST =
  /fonts\.(?:googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net|(?:use|kit)\.fontawesome\.com/i;
const TEXT_EXT = new Set(['.css', '.html', '.js', '.mjs', '.svg']);
const FONT_URL = /url\(\s*["']?[^)"']*\.(?:woff2?|ttf|otf|eot)(?:[?#][^)"']*)?["']?\s*\)/i;

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    // a link could point anywhere: a build folder holds none, so one is an error, not a file
    if (entry.isSymbolicLink()) throw new Error(`scan-built: ${p} is a symbolic link`);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function* elements(node) {
  if (node.tagName) yield node;
  for (const child of node.childNodes ?? []) yield* elements(child);
  if (node.content) yield* elements(node.content); // <template>
}

const attr = (el, name) => el.attrs.find((a) => a.name === name)?.value;
const tokens = (v) => (v ?? '').toLowerCase().split(/\s+/).filter(Boolean);
const positiveInt = (v) => v !== undefined && /^[1-9][0-9]*$/.test(v.trim());

/**
 * Returns { htmlFiles, imageCount, problems: string[] }.
 * Throws if the folder holds no HTML file: an empty scan must never pass.
 */
export function scanBuilt(dir) {
  const files = walkFiles(dir);
  const htmlFiles = files.filter((f) => extname(f) === '.html');
  if (htmlFiles.length === 0) throw new Error(`scan-built: no HTML file in ${dir}`);
  const problems = [];
  let imageCount = 0;
  const rel = (f) => relative(dir, f);

  for (const f of files) {
    if (FONT_EXT.has(extname(f).toLowerCase())) problems.push(`${rel(f)}: font file shipped`);
  }
  for (const f of files.filter((x) => TEXT_EXT.has(extname(x).toLowerCase()))) {
    const text = readFileSync(f, 'utf8');
    if (/@font-face/i.test(text)) problems.push(`${rel(f)}: @font-face`);
    if (/new\s+FontFace\s*\(/.test(text)) problems.push(`${rel(f)}: FontFace() in a script`);
    if (FONT_URL.test(text)) problems.push(`${rel(f)}: url() of a font file`);
    if (FONT_HOST.test(text)) problems.push(`${rel(f)}: a font host (another site's fonts)`);
  }
  for (const f of htmlFiles) {
    for (const el of elements(parse(readFileSync(f, 'utf8')))) {
      if (
        el.tagName === 'link' &&
        tokens(attr(el, 'rel')).includes('preload') &&
        tokens(attr(el, 'as')).includes('font')
      ) {
        problems.push(`${rel(f)}: <link rel="preload" as="font">`);
      }
      if (el.tagName === 'img') {
        imageCount += 1;
        if (!positiveInt(attr(el, 'width')) || !positiveInt(attr(el, 'height'))) {
          problems.push(`${rel(f)}: <img src="${attr(el, 'src') ?? ''}"> has no width and height`);
        }
      }
    }
  }
  return { htmlFiles: htmlFiles.length, imageCount, problems };
}

if (isMain(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: node scripts/assets/scan-built.mjs <built folder>...');
    process.exit(2);
  }
  let failed = false;
  for (const dir of dirs) {
    const r = scanBuilt(dir);
    console.log(`${dir}: ${r.htmlFiles} page(s), ${r.imageCount} image(s)`);
    if (r.imageCount === 0)
      console.log('  no images on pages yet: the image checks have nothing to test');
    for (const p of r.problems) console.error(`  FAIL ${p}`);
    if (r.problems.length > 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
