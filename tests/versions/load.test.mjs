// Unit tests for versions/load.mjs: every "What stops a build" message (TC-A04), no silent
// extra fields (TC-A05), and no path built from a bad id or file name (review C4).
// Each test builds its own versions folder in a temp dir; the repo is never touched.
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { listVersions, loadVersion, VersionError } from '../../versions/load.mjs';

const REAL = JSON.parse(
  readFileSync(new URL('../../versions/payments/version.json', import.meta.url), 'utf8'),
);

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'eng04-load-'));
  addVersion('payments');
  addVersion('consumer');
  mkdirSync(join(dir, '.cache')); // hidden folders are not versions
  writeFileSync(join(dir, 'schema.mjs'), ''); // files are not versions
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function addVersion(id, change = (s) => s) {
  const folder = join(dir, id);
  mkdirSync(folder, { recursive: true });
  const settings = change({ ...REAL, id });
  writeFileSync(join(folder, 'version.json'), JSON.stringify(settings));
  writeFileSync(join(folder, 'og.png'), id);
}

/** Asserts loadVersion throws a VersionError with exactly this message. */
function stops(id, message) {
  assert.throws(
    () => loadVersion(id, dir),
    (err) => {
      assert.ok(err instanceof VersionError, `expected VersionError, got ${err}`);
      assert.equal(err.message, message);
      return true;
    },
  );
}

describe('a valid version loads', () => {
  test('returns the settings and the folder', () => {
    const v = loadVersion('payments', dir);
    assert.equal(v.id, 'payments');
    assert.equal(v.heroSubline, REAL.heroSubline);
    assert.equal(v.dir, join(dir, 'payments'));
  });
  test('the version list is the folders, sorted, without hidden ones', () => {
    assert.deepEqual(listVersions(dir), ['consumer', 'payments']);
  });
});

describe('TC-A04: each problem stops with its ERD message', () => {
  test('no version', () => {
    stops(undefined, 'Pick a version: npm run build:payments, or npm run build for all.');
    stops('', 'Pick a version: npm run build:payments, or npm run build for all.');
  });
  test('unknown version lists the existing ones', () => {
    stops('nope', 'No folder versions/nope. Existing versions: consumer, payments.');
  });
  test('a missing field', () => {
    addVersion('payments', ({ heroSubline, ...rest }) => rest);
    stops('payments', 'versions/payments/version.json: heroSubline is missing');
  });
  test('several missing fields: one line each, in schema order', () => {
    addVersion('payments', ({ siteUrl, approvedNumbers, pageTitle, ...rest }) => rest);
    stops(
      'payments',
      [
        'versions/payments/version.json: siteUrl is missing',
        'versions/payments/version.json: pageTitle is missing',
        'versions/payments/version.json: approvedNumbers is missing',
      ].join('\n'),
    );
  });
  test('a wrong field says what is wrong, not "missing"', () => {
    addVersion('payments', (s) => ({ ...s, siteUrl: 'http://aditya-payments-pm.pages.dev' }));
    stops('payments', 'versions/payments/version.json: siteUrl must be an https URL');
    addVersion('payments', (s) => ({ ...s, indexable: 'yes' }));
    stops('payments', 'versions/payments/version.json: indexable must be true or false');
  });
  test('an empty bullet list and an empty bullet', () => {
    addVersion('payments', (s) => ({ ...s, carinfoBullets: [] }));
    stops(
      'payments',
      'versions/payments/version.json: carinfoBullets must list at least one bullet',
    );
    addVersion('payments', (s) => ({ ...s, carinfoBullets: ['  '] }));
    stops('payments', 'versions/payments/version.json: carinfoBullets.0 must not be empty');
  });
  test('a missing preview image', () => {
    rmSync(join(dir, 'consumer', 'og.png'));
    stops('consumer', 'versions/consumer/og.png not found');
  });
  test('a missing settings file', () => {
    rmSync(join(dir, 'payments', 'version.json'));
    stops('payments', 'versions/payments/version.json not found');
  });
  test('a settings file that is not JSON', () => {
    writeFileSync(join(dir, 'payments', 'version.json'), '{ "id": ');
    assert.throws(
      () => loadVersion('payments', dir),
      /^VersionError: versions\/payments\/version\.json: not valid JSON/,
    );
  });
});

describe('review fixes: nothing is skipped or followed without a word', () => {
  test('a folder with a bad name stops the build instead of being skipped', () => {
    mkdirSync(join(dir, 'Fintech'));
    mkdirSync(join(dir, 'fintech_pm'));
    const message = [
      'versions/Fintech: a version folder name must use only a-z, 0-9 and hyphens',
      'versions/fintech_pm: a version folder name must use only a-z, 0-9 and hyphens',
    ].join('\n');
    assert.throws(() => listVersions(dir), { name: 'VersionError', message });
    stops('payments', message);
  });
  test('a type error reads as plain English', () => {
    addVersion('payments', (s) => ({ ...s, pageTitle: 7, approvedNumbers: '46%' }));
    stops(
      'payments',
      [
        'versions/payments/version.json: pageTitle must be text',
        'versions/payments/version.json: approvedNumbers must be a list of text',
      ].join('\n'),
    );
  });
});

describe('TC-A05: no silent extras', () => {
  test('an unknown field stops the build', () => {
    addVersion('payments', (s) => ({ ...s, phone: 'x' }));
    stops('payments', 'versions/payments/version.json: phone is not a known field');
  });
  test('two unknown fields: one line each', () => {
    addVersion('payments', (s) => ({ ...s, a: 1, b: 2 }));
    stops(
      'payments',
      'versions/payments/version.json: a is not a known field\nversions/payments/version.json: b is not a known field',
    );
  });
});

describe('C4: no path is built from a bad id or file name', () => {
  for (const id of ['../payments', 'payments/', 'Payments', 'pay ments', '.', 'Not-A-Slug']) {
    test(`id "${id}" is unknown`, () => {
      stops(id, `No folder versions/${id}. Existing versions: consumer, payments.`);
    });
  }
  test('the id inside the file must match the folder', () => {
    addVersion('payments', (s) => ({ ...s, id: 'consumer' }));
    stops(
      'payments',
      'versions/payments/version.json: id is "consumer" but the folder is "payments"',
    );
  });
  test('resumeFile is not a field any more: the résumé is in the private folder (D89)', () => {
    addVersion('payments', (s) => ({ ...s, resumeFile: 'resume.pdf' }));
    stops('payments', 'versions/payments/version.json: resumeFile is not a known field');
  });
});
