// Loads and checks one version's settings. Every failure is a VersionError whose message is
// the plain-English text from ERD § Multi-version ("What stops a build"), one line per problem.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, SLUG, versionSchema } from './schema.mjs';

export const VERSIONS_DIR = fileURLToPath(new URL('.', import.meta.url));

export class VersionError extends Error {
  name = 'VersionError';
}

/**
 * Every version folder, sorted. A new folder is a new version (V5): no list to edit.
 * A folder with a bad name stops the build, so a new version is never skipped without a word.
 */
export function listVersions(versionsDir = VERSIONS_DIR) {
  const names = readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
  const bad = names.filter((name) => !SLUG.test(name));
  if (bad.length > 0) {
    throw new VersionError(
      bad
        .map((name) => `versions/${name}: a version folder name must use only a-z, 0-9 and hyphens`)
        .join('\n'),
    );
  }
  return names;
}

/** Returns the checked settings, plus `dir` (the absolute version folder). Throws VersionError. */
export function loadVersion(id, versionsDir = VERSIONS_DIR) {
  if (!id) {
    throw new VersionError('Pick a version: npm run build:payments, or npm run build for all.');
  }
  // The slug check comes before any path is built from the id, so "../x" never reaches the disk.
  const known = listVersions(versionsDir);
  if (!SLUG.test(id) || !known.includes(id)) {
    throw new VersionError(`No folder versions/${id}. Existing versions: ${known.join(', ')}.`);
  }

  const dir = join(versionsDir, id);
  const where = `versions/${id}/version.json`;
  const file = join(dir, 'version.json');
  if (!existsSync(file)) throw new VersionError(`${where} not found`);

  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new VersionError(`${where}: not valid JSON (${err.message})`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new VersionError(`${where}: must hold one JSON object`);
  }

  const result = versionSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.flatMap((issue) => {
      if (issue.code === 'unrecognized_keys') {
        return issue.keys.map((key) => `${where}: ${key} is not a known field`);
      }
      const field = issue.path.join('.');
      const missing = issue.path.length === 1 && raw[issue.path[0]] === undefined;
      return `${where}: ${field} ${missing ? 'is missing' : issue.message}`;
    });
    // Schema order, so the same mistake always prints the same way.
    lines.sort((a, b) => order(a, where) - order(b, where));
    throw new VersionError(lines.join('\n'));
  }

  const settings = result.data;
  if (settings.id !== id) {
    throw new VersionError(`${where}: id is "${settings.id}" but the folder is "${id}"`);
  }
  for (const name of [settings.resumeFile, settings.ogImage]) {
    const path = join(dir, name);
    if (!existsSync(path)) throw new VersionError(`versions/${id}/${name} not found`);
    // A symlink could pull a private file (or another version's résumé) into the build.
    if (!lstatSync(path).isFile()) {
      throw new VersionError(`versions/${id}/${name} must be a real file, not a link or a folder`);
    }
  }
  return { ...settings, dir };
}

function order(line, where) {
  const field = line.slice(where.length + 2).split(/[ .]/)[0];
  const index = FIELDS.indexOf(field);
  return index === -1 ? FIELDS.length : index;
}
