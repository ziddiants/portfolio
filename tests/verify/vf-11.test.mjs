// VF-11 tests (ENG-07, TC-B11): a page missing each required tag, a second h1 and an image without
// alt each fail.
import { describe, expect, test } from 'vitest';
import vf11 from '../../scripts/verify/rules/vf-11.mjs';
import { golden } from './golden.mjs';
import { ids } from './helpers.mjs';

const home = (change) => golden({ edit: { 'index.html': change } });
const drop = (re) => home((s) => s.replace(re, ''));

describe('VF-11 page basics', () => {
  test.each([
    ['lang', (s) => s.replace('<html lang="en">', '<html>')],
    ['h1', (s) => s.replace('</body>', '<h1>Second</h1></body>')],
    ['h1', (s) => s.replace(/<h1>.*?<\/h1>/, '')],
    ['title', (s) => s.replace(/<title>.*?<\/title>/, '<title> </title>')],
    ['description', (s) => s.replace(/<meta\s+name="description"[^>]*>/, '')],
    ['canonical', (s) => s.replace(/<link\s+rel="canonical"[^>]*>/, '')],
    ['canonical', (s) => s.replace('href="https://alpha-test.pages.dev/"', 'href="/"')],
    ['img-alt', (s) => s.replace(/ alt="A payment[^"]*"/, '')],
    ['img-alt', (s) => s.replace('</body>', '<img src="/photo.png" alt=" "></body>')],
    ['img-alt', (s) => s.replace('</body>', '<svg role="img"><path d="M0 0"/></svg></body>')],
  ])('%s: a broken page fails', (check, change) => {
    expect(ids(vf11.run(home(change)))).toEqual([`${check} index.html`]);
  });

  test.each(['og:title', 'og:description', 'og:type', 'og:url', 'og:image'])(
    'a page without %s fails',
    (tag) => {
      const found = vf11.run(drop(new RegExp(`<meta\\s+property="${tag}"[^>]*>`)));
      expect(ids(found)).toEqual(['open-graph index.html']);
      expect(found[0].message).toBe(`lacks ${tag}`);
    },
  );

  test('a relative og:image fails', () => {
    const found = vf11.run(
      home((s) => s.replace('content="https://alpha-test.pages.dev/og.png"', 'content="/og.png"')),
    );
    expect(found[0].message).toBe('has a relative og:image');
  });

  test('an SVG image with a <title> passes', () => {
    const ctx = home((s) =>
      s.replace('</body>', '<svg role="img"><title>A flow</title></svg></body>'),
    );
    expect(vf11.run(ctx)).toEqual([]);
  });
});
