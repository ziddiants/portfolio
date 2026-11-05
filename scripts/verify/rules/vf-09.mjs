// VF-09: visual rules (ENG-07, D27, D32, D39, TC-B09). The built CSS (bundled files, <style>
// blocks and style="" attributes) holds no gradient, blur(), backdrop-filter, box or text
// shadow, @keyframes or animation, no transform in a hover rule, no corner radius above 8 px,
// no raw colour outside the tokens, and no min-width breakpoint other than 600, 768, 1100 or
// 1440 px.
//
// After bundling, tokens.css is merged with every other stylesheet, so its file boundary is gone.
// A raw colour is therefore allowed only as the value of a custom property that
// src/styles/tokens.css declares. Lightning CSS (Vite 8) can rewrite "min-width: 768px" as
// "width>=768px" and "#ff0000" as "red", so both forms are checked (plan review C6).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssSources, customProps, parseCss } from '../lib/css.mjs';
import { snippet } from '../lib/text.mjs';

const BREAKPOINTS = new Set([600, 768, 1100, 1440]);
const MAX_RADIUS = 8;
// The CSS named colours. transparent and currentcolor are not raw colours.
const NAMED = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
  'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
  'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
  'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
  'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
  'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
  'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
  'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
  'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
  'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
  'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
  'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
  'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
  'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
  'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
  'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).split(' ');
const RAW_COLOUR = new RegExp(
  '#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z])' +
    '|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(' +
    `|(?<![\\w-])(?:${NAMED.join('|')})(?![\\w(-])`,
  'i',
);
const RADIUS_PROP = /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/;

/** A value without strings and url(…), where a "#" or a word is not a colour. */
const bare = (v) => v.replace(/url\([^)]*\)/gi, 'url()').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');

/** The px value of every length in a value; a percentage counts as too big (a pill or circle). */
function lengths(value) {
  return [...value.matchAll(/(-?\d*\.?\d+)(px|rem|em|%)?/g)].map(([, n, unit]) => {
    const v = Number(n);
    if (unit === '%') return v > 0 ? Infinity : 0;
    return unit === 'rem' || unit === 'em' ? v * 16 : v;
  });
}

/** Replaces var(--x) with its value, a few levels deep. */
function resolve(value, props) {
  let out = value;
  for (let i = 0; i < 5 && /var\(/.test(out); i++) {
    out = out.replace(
      /var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g,
      (_, name, fb) => props.get(name) ?? fb ?? '',
    );
  }
  return out;
}

/** Every min-width in a media query, in px: "min-width: 48em", "width >= 768px", "768px <= width". */
export function minWidths(prelude) {
  const px = (n, unit) => (unit === 'px' ? Number(n) : Number(n) * 16);
  const out = [];
  for (const m of prelude.matchAll(/min-width\s*:\s*([\d.]+)(px|em|rem)/gi))
    out.push(px(m[1], m[2]));
  for (const m of prelude.matchAll(/(?<![\w-])width\s*>=?\s*([\d.]+)(px|em|rem)/gi))
    out.push(px(m[1], m[2]));
  for (const m of prelude.matchAll(/([\d.]+)(px|em|rem)\s*<=?\s*width(?![\w-])/gi))
    out.push(px(m[1], m[2]));
  return out;
}

/** The custom properties src/styles/tokens.css declares: the only home of raw colours. */
function tokenNames(root) {
  const path = join(root, 'src', 'styles', 'tokens.css');
  if (!existsSync(path)) return new Set();
  const names = new Set();
  for (const r of parseCss(readFileSync(path, 'utf8')).rules) {
    for (const d of r.decls) if (d.prop.startsWith('--')) names.add(d.prop);
  }
  return names;
}

export default {
  id: 'VF-09',
  title: 'Visual rules',
  checks: [
    'gradient',
    'blur',
    'backdrop-filter',
    'shadow',
    'keyframes',
    'animation',
    'hover-transform',
    'radius',
    'raw-colour',
    'breakpoint',
  ],
  needsPrivate: false,
  run(ctx) {
    const tokens = tokenNames(ctx.root);
    const props = customProps(ctx);
    const findings = [];
    const add = (check, file, message, fix) => findings.push({ check, file, message, fix });

    for (const src of cssSources(ctx)) {
      const { rules, atRules } = parseCss(src.css);
      for (const at of atRules) {
        if (/keyframes$/.test(at.name)) {
          add(
            'keyframes',
            src.file,
            `has ${snippet(at.prelude, 50)}`,
            'remove it: no decorative motion (D32)',
          );
        }
        if (at.name === 'media') {
          for (const w of minWidths(at.prelude)) {
            if (!BREAKPOINTS.has(w)) {
              add(
                'breakpoint',
                src.file,
                `has a ${w}px min-width breakpoint (${snippet(at.prelude, 50)})`,
                'use one of 600, 768, 1100 or 1440 px (design doc § Layout)',
              );
            }
          }
        }
      }
      for (const rule of rules) {
        for (const { prop, value } of rule.decls) {
          const where = `${snippet(rule.selector || '(top level)', 40)} { ${prop}: ${snippet(value, 40)} }`;
          const v = bare(value);
          if (/(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(v)) {
            add(
              'gradient',
              src.file,
              `has a gradient: ${where}`,
              'use a flat token colour (D39, C1)',
            );
          }
          if (/\bblur\(/i.test(v)) add('blur', src.file, `has blur(): ${where}`, 'remove it (D39)');
          if (/^(-webkit-)?backdrop-filter$/.test(prop)) {
            add('backdrop-filter', src.file, `has backdrop-filter: ${where}`, 'remove it (D39)');
          }
          if (/^(-webkit-|-moz-)?(box|text)-shadow$/.test(prop) || /\bdrop-shadow\(/i.test(v)) {
            add(
              'shadow',
              src.file,
              `has ${prop}: ${where}`,
              'use spacing and type contrast, never shadows (C1)',
            );
          }
          if (/^(-webkit-)?animation(-|$)/.test(prop)) {
            add(
              'animation',
              src.file,
              `has ${prop}: ${where}`,
              'remove it: no decorative motion (D32)',
            );
          }
          if (
            /:hover/.test(rule.selector) &&
            /^(-webkit-)?(transform|translate|rotate|scale)$/.test(prop)
          ) {
            add(
              'hover-transform',
              src.file,
              `moves on hover: ${where}`,
              'change colour only on hover (DR-IX11)',
            );
          }
          if (RADIUS_PROP.test(prop) || (prop.startsWith('--') && /radius/.test(prop))) {
            if (lengths(resolve(v, props)).some((px) => px > MAX_RADIUS)) {
              add(
                'radius',
                src.file,
                `has a radius above ${MAX_RADIUS}px: ${where}`,
                'use --radius-sm or --radius-xs (DR-X4)',
              );
            }
          }
          const tokenHome = prop.startsWith('--') && tokens.has(prop);
          if (!tokenHome && RAW_COLOUR.test(v)) {
            add(
              'raw-colour',
              src.file,
              `has a raw colour: ${where}`,
              'use a colour token, var(--color-…), from src/styles/tokens.css (VF-09)',
            );
          }
        }
      }
    }
    return findings;
  },
};
