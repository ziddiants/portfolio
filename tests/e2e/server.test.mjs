// Tests of the e2e server and the static file server (ENG-12). The browser suite must never pass
// on a site that was not built, and the file server must not read outside its folder.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { newestFile, staleBecause } from './fresh.mjs';
import { serve } from './static-server.mjs';

const SERVER = fileURLToPath(new URL('./server.mjs', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'eng12-server-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const run = (path, env) =>
  spawnSync(process.execPath, [path], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  });

describe('tests/e2e/server.mjs refuses to start without a build', () => {
  test('an empty dist/ folder: exit 1 and a message that names the file', () => {
    const dist = join(tmp, 'empty-dist');
    mkdirSync(dist);
    const r = run(SERVER, { E2E_DIST_ROOT: dist });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('payments');
    expect(r.stderr).toContain('npm run build');
  });

  test('only one of the two versions built: still exit 1', () => {
    const dist = join(tmp, 'half-dist');
    mkdirSync(join(dist, 'payments'), { recursive: true });
    writeFileSync(join(dist, 'payments', 'index.html'), '<h1>x</h1>');
    const r = run(SERVER, { E2E_DIST_ROOT: dist });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('consumer');
  });

  test('a build older than its sources: exit 1 and the file that is newer', () => {
    const dist = join(tmp, 'stale-dist');
    const src = join(tmp, 'stale-src');
    mkdirSync(src);
    for (const id of ['payments', 'consumer']) {
      mkdirSync(join(dist, id), { recursive: true });
      writeFileSync(join(dist, id, 'index.html'), '<h1>x</h1>');
      utimesSync(join(dist, id, 'index.html'), 1_000_000, 1_000_000);
    }
    writeFileSync(join(src, 'Page.astro'), 'changed after the build');
    const r = run(SERVER, { E2E_DIST_ROOT: dist, E2E_SOURCE_DIRS: src });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is older than');
    expect(r.stderr).toContain('Page.astro');
  });

  test('through a symlinked path the guard still runs (ENG-07 lesson)', () => {
    const link = join(tmp, 'server-link.mjs');
    symlinkSync(SERVER, link);
    const dist = join(tmp, 'empty-dist-2');
    mkdirSync(dist);
    const r = run(link, { E2E_DIST_ROOT: dist });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is missing. Run "npm run build" first.');
  });
});

describe('static file server', () => {
  test('serves /, /name (name.html), assets, and refuses other paths with 404', async () => {
    const root = join(tmp, 'site');
    mkdirSync(join(root, 'work'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<h1>home</h1>');
    writeFileSync(join(root, 'work', 'a.html'), '<h1>a</h1>');
    writeFileSync(join(tmp, 'secret.txt'), 'outside');
    const server = await serve(root, 4390);
    try {
      const get = async (p) => {
        const r = await fetch(`http://127.0.0.1:4390${p}`);
        return [r.status, await r.text()];
      };
      expect(await get('/')).toEqual([200, '<h1>home</h1>']);
      expect(await get('/work/a')).toEqual([200, '<h1>a</h1>']);
      expect((await get('/missing'))[0]).toBe(404);
      // The URL parser removes plain and %2e dot segments before the server sees them, so only an
      // encoded slash reaches the containment check.
      expect((await get('/..%2fsecret.txt'))[0]).toBe(404);
      expect((await get('/work/..%2f..%2fsecret.txt'))[0]).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe('staleBecause: is the build older than its sources?', () => {
  const folder = (name, builtAt, sourceAt) => {
    const root = join(tmp, name);
    mkdirSync(join(root, 'src', 'deep'), { recursive: true });
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'built.html'), 'built');
    writeFileSync(join(root, 'src', 'deep', 'a.astro'), 'a');
    writeFileSync(join(root, 'node_modules', 'new.js'), 'ignored: newer but in node_modules');
    utimesSync(join(root, 'built.html'), builtAt, builtAt);
    utimesSync(join(root, 'src', 'deep', 'a.astro'), sourceAt, sourceAt);
    return root;
  };

  test('a source newer than the build is named, however deep it sits', () => {
    const root = folder('fresh-a', 1_000, 2_000);
    expect(staleBecause(join(root, 'built.html'), [join(root, 'src')])).toBe(
      join(root, 'src', 'deep', 'a.astro'),
    );
  });

  test('a build newer than every source is current (null); node_modules is not a source', () => {
    const root = folder('fresh-b', 3_000, 2_000);
    expect(staleBecause(join(root, 'built.html'), [join(root, 'src'), root])).toBeNull();
  });

  test('no source file at all is an error, not "current"', () => {
    const root = folder('fresh-c', 3_000, 2_000);
    expect(() => staleBecause(join(root, 'built.html'), [join(root, 'missing')])).toThrow(
      /no source/,
    );
    expect(newestFile([join(root, 'missing')]).file).toBeNull();
  });
});
