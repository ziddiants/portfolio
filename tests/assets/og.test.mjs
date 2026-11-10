// Link-preview images (DS-OG): 1200 × 630, within budget, no metadata, one per version, text read
// from the version's own files. Pixels cannot be scanned for names (VF-02 reads text only), so
// Aditya looks at both images (plan review C4).
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { ogHtml, ogTexts, OG_HEIGHT, OG_WIDTH, renderOgBuffers } from '../../scripts/assets/og.mjs';
import { listVersions } from '../../versions/load.mjs';
import { metadataChunks, read } from './helpers.mjs';

const versions = listVersions();
const subline = (id) => JSON.parse(read(`versions/${id}/version.json`).toString()).heroSubline;
const sha = (b) => createHash('sha256').update(b).digest('hex');

describe('committed versions/<id>/og.png', () => {
  test('there is more than one version to compare', () => {
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  test.each(versions)('%s is 1200 × 630, at most 150 KB, with no metadata', async (id) => {
    const buf = read(`versions/${id}/og.png`);
    const meta = await sharp(buf).metadata();
    expect([meta.width, meta.height]).toEqual([OG_WIDTH, OG_HEIGHT]);
    expect(buf.length).toBeLessThanOrEqual(150 * 1024);
    expect(metadataChunks(buf)).toEqual([]);
  });

  test('the two versions are different files', () => {
    const hashes = versions.map((id) => sha(read(`versions/${id}/og.png`)));
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe('template text', () => {
  test.each(versions)('%s: the texts come from its own version.json and hero.yaml', (id) => {
    const t = ogTexts(id);
    expect(t.subline).toBe(subline(id));
    expect(t.name).toBe('Aditya Gupta');
    expect(t.heroLine.length).toBeGreaterThan(10);
  });

  test("no version's page text holds another version's subline", () => {
    for (const a of versions) {
      const html = ogHtml(ogTexts(a));
      for (const b of versions.filter((x) => x !== a))
        expect(html, `${a} vs ${b}`).not.toContain(subline(b));
    }
  });

  test('the template has no photo and no gradient, and its text holds no phone number (DS-OG)', () => {
    const texts = ogTexts(versions[0]);
    expect(ogHtml(texts)).not.toMatch(/gradient|<img/i);
    // any run of 7 or more digits (spaces and dashes allowed between them) would be a phone number
    for (const [field, value] of Object.entries(texts))
      expect(value, field).not.toMatch(/(?:\d[\s-]?){7,}/);
  });

  test('text is escaped, so markup in a field cannot change the page', () => {
    const html = ogHtml({ name: 'A', heroLine: '<script>x</script>', subline: 'B & C' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('B &amp; C');
  });

  test('an unknown version id is refused', () => {
    expect(() => ogTexts('nope')).toThrow();
  });
});

async function chromiumPresent() {
  try {
    const { chromium } = await import('playwright-core');
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

const hasChromium = await chromiumPresent();

describe('render (needs Chromium; reported as skipped when it is missing)', () => {
  test.skipIf(!hasChromium)(
    'renders a 1200 × 630 PNG for each version',
    async () => {
      const out = await renderOgBuffers(versions);
      for (const id of versions) {
        const meta = await sharp(out[id]).metadata();
        expect([meta.width, meta.height]).toEqual([OG_WIDTH, OG_HEIGHT]);
        expect(out[id].length).toBeLessThanOrEqual(150 * 1024);
        expect(metadataChunks(out[id])).toEqual([]);
      }
      expect(sha(out[versions[0]])).not.toBe(sha(out[versions[1]]));
    },
    120_000,
  );
});
