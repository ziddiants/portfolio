// Reads the built CSS for VF-09 and VF-10 (ENG-07). CSS reaches a page three ways: bundled
// .css files, <style> blocks (Astro inlines small stylesheets) and style="" attributes. A rule
// that read only .css files would miss the other two (plan review C6).
//
// The parser is small on purpose: it splits minified output into rules and at-rules, follows
// @media and nesting, and keeps strings and parentheses whole (a data: URL can hold ";").
import { attr, memo, pages, textFiles, walk } from './site.mjs';

/** Every piece of CSS as { file, css, inline }. */
export function cssSources(ctx) {
  return memo(ctx, 'css', () => {
    const out = textFiles(ctx)
      .filter((f) => /\.css$/i.test(f.file))
      .map(({ file, text }) => ({ file, css: text, inline: false }));
    for (const page of pages(ctx)) {
      for (const el of walk(page.doc)) {
        if (el.tagName === 'style') {
          out.push({ file: page.file, css: el.childNodes.map((c) => c.value ?? '').join('') });
        }
        const style = attr(el, 'style');
        if (style) out.push({ file: page.file, css: `[style]{${style}}`, inline: true });
      }
    }
    return out;
  });
}

/**
 * Parses CSS into { rules, atRules }.
 * rules:   { selector, media: [prelude, …], decls: [{ prop, value }] }  (selector holds parents)
 * atRules: { name, prelude }  (every @-rule, including @import and @keyframes)
 */
export function parseCss(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const atRules = [];
  let i = 0;

  const readQuoted = () => {
    const q = css[i];
    let s = css[i++];
    while (i < css.length && css[i] !== q) s += css[i] === '\\' ? css[i++] + css[i++] : css[i++];
    return s + (css[i++] ?? '');
  };
  const readParens = () => {
    let depth = 0;
    let s = '';
    while (i < css.length) {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        s += readQuoted();
        continue;
      }
      s += ch;
      i++;
      if (ch === '(') depth++;
      if (ch === ')' && --depth === 0) break;
    }
    return s;
  };
  const addDecl = (text, decls) => {
    const t = text.trim();
    if (!t) return;
    if (t.startsWith('@')) {
      atRules.push({ name: /^@([\w-]+)/.exec(t)?.[1]?.toLowerCase() ?? '', prelude: t });
      return;
    }
    const colon = t.indexOf(':');
    if (colon < 1) return;
    decls.push({
      prop: t.slice(0, colon).trim().toLowerCase(),
      value: t
        .slice(colon + 1)
        .replace(/!\s*important\s*$/i, '')
        .trim(),
    });
  };

  // Reads the inside of a block up to its closing "}" and returns its declarations.
  const readBlock = (chain, media) => {
    const decls = [];
    let buf = '';
    while (i < css.length) {
      const ch = css[i];
      if (ch === '"' || ch === "'") buf += readQuoted();
      else if (ch === '(') buf += readParens();
      else if (ch === ';') {
        i++;
        addDecl(buf, decls);
        buf = '';
      } else if (ch === '{') {
        i++;
        child(buf.trim(), chain, media);
        buf = '';
      } else if (ch === '}') {
        i++;
        break;
      } else {
        buf += ch;
        i++;
      }
    }
    addDecl(buf, decls);
    return decls;
  };

  const child = (prelude, chain, media) => {
    if (prelude.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? '';
      atRules.push({ name, prelude });
      if (/keyframes$/.test(name)) {
        readBlock(['@keyframes'], media); // its steps are not page rules
        return;
      }
      const inner = name === 'media' ? [...media, prelude] : media;
      const decls = readBlock(name === 'font-face' ? ['@font-face'] : chain, inner);
      if (decls.length)
        rules.push({ selector: chain.join(' ') || `@${name}`, media: inner, decls });
      return;
    }
    const next = [...chain, prelude];
    const decls = readBlock(next, media);
    rules.push({ selector: next.join(' '), media, decls });
  };

  while (i < css.length) {
    const decls = readBlock([], []);
    if (decls.length) rules.push({ selector: '', media: [], decls });
  }
  return { rules, atRules };
}

/** Every custom property (--name: value) declared anywhere in the build, last one wins. */
export function customProps(ctx) {
  return memo(ctx, 'customProps', () => {
    const map = new Map();
    for (const src of cssSources(ctx)) {
      for (const r of parseCss(src.css).rules) {
        for (const d of r.decls) if (d.prop.startsWith('--')) map.set(d.prop, d.value);
      }
    }
    return map;
  });
}
