// A script that is started through a symlinked path must still run (ENG-07 lesson, ENG-11 review).
// Before this fix the scanner printed nothing and exited 0 on a bad build when run through a symlink.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { REPO } from './helpers.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'eng11-link-')));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const link = join(tmp, 'repo-link');
symlinkSync(REPO, link);
const bad = join(tmp, 'bad');
mkdirSync(bad);
writeFileSync(
  join(bad, 'index.html'),
  '<!doctype html><html><head><title>t</title></head><body><img src="a.png"></body></html>',
);

const run = (script, ...args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

describe('scan-built as a command', () => {
  test('on a bad build it exits 1 and names the image (real path)', () => {
    const r = run(join(REPO, 'scripts/assets/scan-built.mjs'), bad);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('has no width and height');
  });

  test('on a bad build it exits 1 and names the image (through a symlinked path)', () => {
    const r = run(join(link, 'scripts/assets/scan-built.mjs'), bad);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('has no width and height');
  });

  test('with no folder given it exits 2 and prints the usage', () => {
    const r = run(join(link, 'scripts/assets/scan-built.mjs'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage');
  });
});

describe('isMain (used by every script in scripts/assets)', () => {
  // A probe script in a temp folder imports the real helper and prints what it returns.
  const probe = join(tmp, 'probe.mjs');
  writeFileSync(
    probe,
    `import { isMain } from ${JSON.stringify(join(REPO, 'scripts/assets/is-main.mjs'))};\nconsole.log(String(isMain(import.meta.url)));\n`,
  );
  const probeLink = join(tmp, 'probe-link.mjs');
  symlinkSync(probe, probeLink);

  test('is true when the file is started by its real path', () => {
    expect(run(probe).stdout.trim()).toBe('true');
  });

  test('is true when the file is started through a symlink', () => {
    expect(run(probeLink).stdout.trim()).toBe('true');
  });

  test('is false when the file is only imported', () => {
    const importer = join(tmp, 'importer.mjs');
    writeFileSync(importer, `import ${JSON.stringify(probe)};\n`);
    // the probe prints isMain(import.meta.url) of ITSELF: it is not the entry file, so false
    expect(run(importer).stdout.trim()).toBe('false');
  });
});
