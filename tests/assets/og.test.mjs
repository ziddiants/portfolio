// Link-preview images (DS-OG): 1200 × 630, within budget, no metadata, one per version, text read
// from the version's own files. Pixels cannot be scanned for names (VF-02 reads text only), so
// Aditya looks at both images (plan review C4).
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
  ogHtml,
  ogTexts,
  OG_HEIGHT,
  OG_WIDTH,
  renderOgBuffers,
  INPUTS_FILE,
  ogInputHash,
  renderOgFromTexts,
} from '../../scripts/assets/og.mjs';
import { listVersions } from '../../versions/load.mjs';
import { pngProblems, read } from './helpers.mjs';

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
    expect(pngProblems(buf)).toEqual([]);
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

describe('each committed og.png was rendered from the current texts and template', () => {
  // CI has no Chromium and cannot read the pixels. This ties each PNG to its inputs instead:
  // `npm run assets:og` saves a hash of the page it rendered; a changed subline, hero line, name or
  // template without a re-render makes the hash differ (ENG-11 review, finding 1).
  const saved = JSON.parse(readFileSync(INPUTS_FILE, 'utf8'));

  test('the file lists exactly the versions that exist', () => {
    expect(Object.keys(saved).sort()).toEqual([...versions].sort());
  });

  test.each(versions)('%s: the saved hash equals the hash of its current inputs', (id) => {
    expect(saved[id], `${id}: run npm run assets:og`).toBe(ogInputHash(id));
  });

  test('the hash changes when the subline changes (the check can fail)', () => {
    const a = ogHtml({ ...ogTexts(versions[0]) });
    const b = ogHtml({ ...ogTexts(versions[0]), subline: 'Product Manager · something else' });
    expect(sha(a)).not.toBe(sha(b));
  });

  test('the two versions have different hashes', () => {
    expect(ogInputHash(versions[0])).not.toBe(ogInputHash(versions[1]));
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
        expect(pngProblems(out[id])).toEqual([]);
      }
      expect(sha(out[versions[0]])).not.toBe(sha(out[versions[1]]));
    },
    120_000,
  );
});

describe('render guards (need Chromium)', () => {
  // One test per guard, each built so that only that guard can fire (a very long hero line would
  // trip both, and switching either guard off would leave the test green).
  test.skipIf(!hasChromium)(
    'a subline so long that the page overflows is an error (the fit guard alone)',
    async () => {
      const texts = ogTexts(versions[0]);
      const long = { ...texts, subline: Array(30).fill('payments and monetization').join(' · ') };
      const err = await renderOgFromTexts(long).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/does not fit/);
    },
    120_000,
  );

  test.skipIf(!hasChromium)(
    'a hero line of four lines is an error even though the page still fits (the line-count guard alone)',
    async () => {
      const texts = ogTexts(versions[0]);
      const four = {
        ...texts,
        heroLine: Array(5).fill('quietly losing money and trust').join(' '),
      };
      const err = await renderOgFromTexts(four).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/needs [4-9] lines/);
    },
    120_000,
  );

  test.skipIf(!hasChromium)(
    'a normal version renders without that error',
    async () => {
      const buf = await renderOgFromTexts(ogTexts(versions[0]));
      expect(buf.length).toBeGreaterThan(1000);
    },
    120_000,
  );
});
