// The CarInfo diagram (DS-DIA): real text, role="img", title and description from the content pack,
// tokens only, both layouts, within 15 KB, no partner names (D31).
import { readFileSync } from 'node:fs';
import { parseFragment } from 'parse5';
import { describe, expect, test } from 'vitest';
import {
  DIAGRAM_DESC,
  DIAGRAM_KEY,
  DIAGRAM_TITLE,
  diagramSvg,
} from '../../src/lib/carinfo-diagram.ts';
import { phonesIn } from '../../scripts/verify/rules/vf-01.mjs';
import { repoPath } from './helpers.mjs';

// Copied from content-pack.md line 400 (the vault is not in CI). Update both if the pack changes (C14).
const PACK_TITLE = 'How a CarInfo payment flows after the change';
const PACK_DESC =
  "A customer pays. Routing picks a gateway; if that gateway fails, the payment switches automatically to another. If it fails on the customer's side, a retry page shows the bank's error in plain words and why a retry should work.";
// content-pack.md line 223
const PACK_KEY = ['Indigo: what we added.', 'Grey: what already existed.'];

const row = diagramSvg('row');
const col = diagramSvg('column');
const component = readFileSync(repoPath('src/components/CarInfoDiagram.astro'), 'utf8');

function* walk(n) {
  if (n.tagName) yield n;
  for (const c of n.childNodes ?? []) yield* walk(c);
}
const parsed = (svg) => [...walk(parseFragment(svg))];
const tspansOf = (svg) =>
  parsed(svg)
    .filter((e) => e.tagName === 'tspan')
    .map((e) => e.childNodes.map((c) => c.value ?? '').join(''));
const textOf = (svg) =>
  parsed(svg)
    .filter((e) => e.tagName === 'text')
    .map((e) =>
      e.childNodes.map((c) => c.value ?? c.childNodes?.map((t) => t.value).join('')).join(''),
    );

describe.each([
  ['row', row],
  ['column', col],
])('%s layout', (_layout, svg) => {
  test('has role="img" with a title and a description, linked by id', () => {
    const els = parsed(svg);
    const root = els.find((e) => e.tagName === 'svg');
    expect(root.attrs.find((a) => a.name === 'role')?.value).toBe('img');
    const ids = els
      .filter((e) => ['title', 'desc'].includes(e.tagName))
      .map((e) => e.attrs.find((a) => a.name === 'id')?.value);
    expect(ids).toHaveLength(2);
    expect(root.attrs.find((a) => a.name === 'aria-labelledby')?.value.split(' ')).toEqual(ids);
  });

  test('title, description and key are the content-pack text, word for word', () => {
    expect(DIAGRAM_TITLE).toBe(PACK_TITLE);
    expect(DIAGRAM_DESC).toBe(PACK_DESC);
    expect([...DIAGRAM_KEY]).toEqual(PACK_KEY);
    expect(svg).toContain(`>${PACK_TITLE}</title>`);
    expect(svg.replace(/&amp;/g, '&')).toContain(PACK_DESC);
    for (const k of PACK_KEY) expect(svg).toContain(k);
  });

  test('draws every step of the spec as real text, each as its own line', () => {
    // exact line match: "Retry" must not be satisfied by "Retry page", nor "Routing" by itself twice
    const lines = tspansOf(svg);
    for (const step of [
      'Customer pays',
      'Routing',
      'picks a gateway',
      'from its signals',
      'Gateway A',
      'Automatic switch',
      'Gateway B',
      'Retry page',
      'error in plain words',
      'Retry',
    ]) {
      expect(
        lines.filter((l) => l === step),
        step,
      ).toHaveLength(1);
    }
    const labels = textOf(svg);
    expect(labels).toContain('gateway fault');
    expect(labels).toContain('user-side failure');
  });

  test('uses tokens only: no hex value, no rgb(), no fill or stroke colour', () => {
    expect(svg).not.toMatch(/\bstyle=/); // an inline style could hold a colour the checks below do not see
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(svg).not.toMatch(/\b(fill|stroke)="(?!none)/);
  });

  test('holds nothing the VF-01 phone check reads as a number', () => {
    expect(phonesIn(svg)).toEqual([]);
  });

  test('names no partner and shows no fee, screen capture or logo (D31)', () => {
    expect(svg).not.toMatch(
      /razorpay|payu|cashfree|paytm|ccavenue|juspay|phonepe|\bfee|<image|<img/i,
    );
  });
});

describe('both layouts together', () => {
  test('stay within 15 KB', () => {
    expect(Buffer.byteLength(row + col)).toBeLessThanOrEqual(15 * 1024);
  });

  test('share no id, so a page can hold both', () => {
    const ids = [row, col].flatMap((s) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the wrapper shows one layout at a time and holds no raw colour', () => {
    expect(component).toContain("diagramSvg('row')");
    expect(component).toContain("diagramSvg('column')");
    expect(component).toMatch(/\.cd-row\s*{\s*display:\s*none/);
    expect(component).toMatch(/min-width:\s*600px/);
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(component).toContain('var(--color-accent)');
    expect(component).toContain('var(--color-text-muted)');
  });
});
