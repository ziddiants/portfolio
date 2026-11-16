// ENG-14 hero data checks: the résumé size comes from the built file and a missing file stops the
// build (seam 1); the domain chips equal the Domains line of each real résumé (TC-C02). The résumés
// are private, so the second part runs only on a machine that has them; CI skips it and says so.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { afterEach, describe, expect, test } from 'vitest';
import { privateDir } from '../../scripts/verify/lib/private.mjs';
import { keepLastWordsTogether } from '../../src/lib/hero-line.ts';
import { resumeBytes } from '../../src/lib/resume-size.ts';
import { downloadLabel } from '../../src/lib/format-size.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
let dir;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

describe('resumeBytes (hero button label)', () => {
  test("returns the size of this version's built résumé, and the label shows it", () => {
    dir = mkdtempSync(join(tmpdir(), 'hero-size-'));
    mkdirSync(join(dir, '.build', 'public-payments'), { recursive: true });
    writeFileSync(
      join(dir, '.build', 'public-payments', 'Aditya-Gupta-Resume.pdf'),
      Buffer.alloc(118_400),
    );
    const bytes = resumeBytes('payments', dir);
    expect(bytes).toBe(118_400);
    expect(downloadLabel('Résumé', 'PDF', bytes)).toBe('Résumé · PDF, 118 KB');
  });

  test("a version's label never reads another version's file", () => {
    dir = mkdtempSync(join(tmpdir(), 'hero-size-'));
    mkdirSync(join(dir, '.build', 'public-consumer'), { recursive: true });
    writeFileSync(
      join(dir, '.build', 'public-consumer', 'Aditya-Gupta-Resume.pdf'),
      Buffer.alloc(5000),
    );
    expect(() => resumeBytes('payments', dir)).toThrow(/public-payments.*missing.*dev:payments/s);
  });

  test('a missing file stops the build; it never prints "0 KB"', () => {
    dir = mkdtempSync(join(tmpdir(), 'hero-size-'));
    expect(() => resumeBytes('payments', dir)).toThrow(/Aditya-Gupta-Resume\.pdf is missing/);
  });
});

describe('keepLastWordsTogether (DR-K3)', () => {
  test('joins the last two words with a no-break space and changes nothing else', () => {
    const out = keepLastWordsTogether('and fix it.');
    expect(out).toBe('and fix\u00a0it.');
    expect(out.replace('\u00a0', ' ')).toBe('and fix it.');
  });
  test('a one-word line is returned as it is (no duplicated text)', () => {
    expect(keepLastWordsTogether('Hello')).toBe('Hello');
    expect(keepLastWordsTogether('')).toBe('');
  });
});

describe('the proof strip of each version (D105, D106)', () => {
  const strip = (id) =>
    JSON.parse(readFileSync(join(REPO, 'versions', id, 'version.json'), 'utf8')).proofStrip;
  test('Payments has three figures and Consumer has four', () => {
    expect(strip('payments').length).toBe(3);
    expect(strip('consumer').length).toBe(4);
  });
});

const resumePath = (id) => join(privateDir(), 'resumes', `${id}.pdf`);
const haveResumes = ['payments', 'consumer'].every((id) => existsSync(resumePath(id)));
if (!haveResumes)
  console.log('hero: the private résumés are not here; the Domains comparison is skipped');

describe.skipIf(!haveResumes)('TC-C02: the chips equal the résumé Domains line', () => {
  const chips = parse(readFileSync(join(REPO, 'src/content/home/hero.yaml'), 'utf8'))[0]
    .domainChips;
  test.each(['payments', 'consumer'])('%s: the same five, in the same order', (id) => {
    const r = spawnSync('pdftotext', ['-enc', 'UTF-8', resumePath(id), '-'], { encoding: 'utf8' });
    expect(r.status, 'pdftotext ran').toBe(0);
    const lines = r.stdout.split('\n').map((l) => l.trim());
    const line = lines[lines.indexOf('Domains') + 1];
    const fromResume = line.split(' · ');
    console.log(
      `hero ${id}: ${chips.length} chips, ${fromResume.length} in the résumé Domains line`,
    );
    expect(chips.length).toBeGreaterThan(0);
    expect(chips).toEqual(fromResume);
  });
});
