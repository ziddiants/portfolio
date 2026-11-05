// Reads one built site, dist/<id>/, for the verify rules (ENG-07). Each HTML page is parsed once
// per run with parse5 (D81), so every rule sees the same decoded text: Astro writes "&" as
// "&amp;", and a search of the raw HTML for the plain text would find nothing (plan review C5).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, posix, relative, sep } from 'node:path';
import { parse } from 'parse5';
import { fold } from './text.mjs';

const memos = new WeakMap();
/** One value per ctx and key: rules that run on the same build share the work. */
export function memo(ctx, key, make) {
  let m = memos.get(ctx);
  if (!m) memos.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

/** Every file under dist/<id>/ as a sorted, forward-slash path relative to it. */
export function listFiles(ctx) {
  return memo(ctx, 'files', () => {
    const out = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(relative(ctx.distDir, p).split(sep).join('/'));
      }
    };
    walk(ctx.distDir);
    return out.sort();
  });
}

export const abs = (ctx, file) => join(ctx.distDir, ...file.split('/'));
export const sizeOf = (ctx, file) => statSync(abs(ctx, file)).size;

// Files that are not text. Every other file is read as text, whatever its extension: a .vcf,
// .md, .csv or a file with no extension must not escape the scans (review finding F4).
const BINARY_EXT = new Set(
  (
    '.png .jpg .jpeg .webp .avif .gif .ico .bmp .tif .tiff .woff .woff2 .ttf .otf .eot ' +
    '.mp4 .webm .mp3 .wav .ogg .zip .gz .br .pdf'
  ).split(' '),
);
const isBinary = (f) => BINARY_EXT.has(extname(f).toLowerCase());

/** Every file that is not binary, as { file, text }. */
export function textFiles(ctx) {
  return memo(ctx, 'text', () =>
    listFiles(ctx)
      .filter((f) => !isBinary(f))
      .map((file) => ({ file, text: readFileSync(abs(ctx, file), 'utf8') })),
  );
}

/**
 * Every binary file except PDFs, as { file, text } with one character per byte. Image metadata
 * (EXIF, PNG text chunks) is plain bytes, so a name or number in it shows up here.
 */
export function binaryFiles(ctx) {
  return memo(ctx, 'binary', () =>
    listFiles(ctx)
      .filter((f) => isBinary(f) && !/\.pdf$/i.test(f))
      .map((file) => ({ file, text: readFileSync(abs(ctx, file)).toString('latin1') })),
  );
}

/**
 * Every HTML page as { file, html, doc }. No page at all is a failure: an empty build or a
 * wrong path must never pass a rule that found nothing to check.
 */
export function pages(ctx) {
  return memo(ctx, 'pages', () => {
    const list = textFiles(ctx)
      .filter((f) => /\.html?$/i.test(f.file))
      .map(({ file, text }) => ({
        file,
        html: text,
        doc: parse(text, { sourceCodeLocationInfo: true, scriptingEnabled: false }),
      }));
    if (list.length === 0) {
      throw new Error(`no HTML page in ${relative(ctx.root, ctx.distDir) || ctx.distDir}`);
    }
    return list;
  });
}

/** Every node under `node`, depth first. Template content is not walked: it is not shown. */
export function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
}

export const elements = (doc, tag) => [...walk(doc)].filter((n) => n.tagName === tag);
export const attr = (el, name) => el.attrs?.find((a) => a.name === name)?.value;
export const relTokens = (el) => (attr(el, 'rel') ?? '').toLowerCase().split(/\s+/);

const HIDDEN = new Set(['script', 'style', 'template']);
/** The folded text inside an element, without script and style. */
export function textOf(node) {
  let out = '';
  for (const n of walk(node)) {
    if (n.nodeName === '#text' && !hasHiddenParent(n, node)) out += n.value;
  }
  return fold(out);
}
function hasHiddenParent(n, stop) {
  for (let p = n.parentNode; p && p !== stop; p = p.parentNode) {
    if (HIDDEN.has(p.tagName)) return true;
  }
  return false;
}

// Elements that start a new piece of text. Inline elements (a, strong, span) join their text.
const BLOCK = new Set(
  (
    'address article aside blockquote body br button caption dd details dialog div dl dt ' +
    'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr label li main ' +
    'nav ol option p pre section summary table tbody td tfoot th thead title tr ul'
  ).split(' '),
);

/** The text a visitor reads, one folded string per block: body text plus the page title. */
export function blocks(doc) {
  const out = [];
  let buf = '';
  const flush = () => {
    const t = fold(buf);
    if (t) out.push(t);
    buf = '';
  };
  const visit = (node) => {
    const tag = node.tagName;
    if (HIDDEN.has(tag)) return;
    if (tag === 'head') {
      for (const c of node.childNodes) if (c.tagName === 'title') visit(c);
      return;
    }
    if (node.nodeName === '#text') {
      buf += node.value;
      return;
    }
    const isBlock = BLOCK.has(tag);
    if (isBlock) flush();
    for (const c of node.childNodes ?? []) visit(c);
    if (isBlock) flush();
  };
  visit(doc);
  flush();
  return out;
}

const TEXT_ATTRS = ['alt', 'title', 'aria-label', 'aria-description', 'placeholder'];
const META_TEXT =
  /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)$/i;

/** Text a visitor or a link preview shows outside the body text: alt, labels, descriptions. */
export function attrTexts(doc) {
  const out = [];
  for (const el of walk(doc)) {
    if (!el.attrs) continue;
    for (const name of TEXT_ATTRS) {
      const v = attr(el, name);
      if (v && fold(v)) out.push(fold(v));
    }
    if (el.tagName === 'meta' && META_TEXT.test(attr(el, 'name') ?? attr(el, 'property') ?? '')) {
      const v = fold(attr(el, 'content') ?? '');
      if (v) out.push(v);
    }
  }
  return out;
}

/** Every readable string of a page: body blocks, then attribute and meta text. */
export const readable = (page) => [...blocks(page.doc), ...attrTexts(page.doc)];

/** Every attribute value of a page, decoded (hrefs, data-*, content). */
export function attrValues(doc) {
  const out = [];
  for (const el of walk(doc)) for (const a of el.attrs ?? []) if (a.value) out.push(a.value);
  return out;
}

/** True for a URL on another origin: http(s)://… or //…. */
export const isOutside = (url) => /^\s*(https?:)?\/\//i.test(url ?? '');

/** The origin of an absolute URL, or null. */
export function originOf(url) {
  try {
    return new URL(url.trim().replace(/^\/\//, 'https://')).origin;
  } catch {
    return null;
  }
}

/** A same-site URL from `page` as a dist file path, or null for outside or non-file URLs. */
export function localFile(page, url) {
  if (!url || isOutside(url) || /^\s*[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#')) {
    return null;
  }
  const clean = decodeURI(url.split(/[?#]/)[0]);
  const joined = clean.startsWith('/')
    ? clean.slice(1)
    : posix.join(posix.dirname(page.file), clean);
  return posix.normalize(joined);
}
