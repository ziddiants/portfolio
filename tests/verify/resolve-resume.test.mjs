// resolveResume (ENG-09, D89, D90): the one place that finds a version's résumé.
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  resolveResume,
  resumePath,
  STUB_MARKER,
  stubResumePdf,
  writeManifest,
} from '../../versions/resume.mjs';
import { tempDir } from './helpers.mjs';

const privateWith = (files = {}, manifest = true) => {
  const dir = tempDir('resume-private-');
  mkdirSync(join(dir, 'resumes'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'resumes', name), body);
  if (manifest)
    writeManifest(
      dir,
      Object.keys(files).map((n) => n.replace(/\.pdf$/, '')),
    );
  return dir;
};

describe('resolveResume', () => {
  test('the real file is used when it exists, in CI too', () => {
    const dir = privateWith({ 'payments.pdf': 'x' });
    for (const env of [{}, { CI: 'true' }]) {
      expect(resolveResume('payments', { privateDir: dir, env })).toEqual({
        kind: 'real',
        path: resumePath('payments', dir),
      });
    }
  });

  test('a local build with no résumé stops and names the fix', () => {
    const dir = privateWith();
    expect(() => resolveResume('payments', { privateDir: dir, env: {} })).toThrow(
      /no résumé for "payments".*resumes[\\/]raw[\\/]payments\.pdf.*npm run resume:prepare/s,
    );
  });

  test('CI with no résumé gets the stub', () => {
    expect(resolveResume('payments', { privateDir: privateWith(), env: { CI: 'true' } })).toEqual({
      kind: 'stub',
    });
  });

  test('CI=false and CI="" are not CI', () => {
    for (const CI of ['false', '', '1']) {
      expect(() => resolveResume('payments', { privateDir: privateWith(), env: { CI } })).toThrow();
    }
  });

  test('a link is refused, in CI too', () => {
    const dir = privateWith({ 'other.pdf': 'x' });
    symlinkSync(join(dir, 'resumes', 'other.pdf'), join(dir, 'resumes', 'payments.pdf'));
    for (const env of [{}, { CI: 'true' }]) {
      expect(() => resolveResume('payments', { privateDir: dir, env })).toThrow(/not a link/);
    }
  });

  test('a folder is refused', () => {
    const dir = privateWith();
    mkdirSync(join(dir, 'resumes', 'payments.pdf'));
    expect(() => resolveResume('payments', { privateDir: dir, env: {} })).toThrow(/not a link/);
  });

  test('a résumé that is not the file the intake wrote does not ship (review finding 2)', () => {
    const dir = privateWith({ 'payments.pdf': 'as scanned' });
    writeFileSync(join(dir, 'resumes', 'payments.pdf'), 'edited by hand afterwards');
    for (const env of [{}, { CI: 'true' }]) {
      expect(() => resolveResume('payments', { privateDir: dir, env })).toThrow(
        /npm run resume:prepare/,
      );
    }
  });

  test('a résumé with no manifest entry, or no manifest, does not ship', () => {
    const noFile = privateWith({ 'payments.pdf': 'x' }, false);
    expect(() => resolveResume('payments', { privateDir: noFile, env: {} })).toThrow(/manifest/);
    const other = privateWith({ 'payments.pdf': 'x', 'consumer.pdf': 'y' });
    rmSync(join(other, 'resumes', 'manifest.json'));
    writeFileSync(join(other, 'resumes', 'manifest.json'), '{ "consumer": "00" }');
    expect(() => resolveResume('payments', { privateDir: other, env: {} })).toThrow(/manifest/);
  });

  test('a broken manifest stops the build and does not print its text', () => {
    const dir = privateWith({ 'payments.pdf': 'x' });
    writeFileSync(join(dir, 'resumes', 'manifest.json'), '{ "payments": "secret-text" ');
    const run = () => resolveResume('payments', { privateDir: dir, env: {} });
    expect(run).toThrow(/manifest/);
    expect(run).not.toThrow(/secret-text/);
  });

  test('the stub says what it is and holds no digit', () => {
    const bytes = stubResumePdf().toString('latin1');
    expect(bytes).toContain(STUB_MARKER);
    expect(bytes.match(/\((.*?)\) Tj/g).join('')).not.toMatch(/\d/);
  });
});
