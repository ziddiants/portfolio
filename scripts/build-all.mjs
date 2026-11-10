// Builds every version into dist/<id>/, one at a time, each followed by verify (ERD § Multi-version).
// The version list is the folders in versions/, so a new version needs no shared-file edit (V5).
//
// Usage: node scripts/build-all.mjs          every version (empties dist/ first)
//        node scripts/build-all.mjs <id>     one version
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVersions, loadVersion, VersionError } from '../versions/load.mjs';
import { assemblePublic } from './assemble-public.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASTRO = join(ROOT, 'node_modules', '.bin', 'astro');
const TOTAL_RULES = 16; // ERD § Guardrails: the verify rules

function run(step, id, command, args) {
  console.log(`\n▶ ${id}: ${step}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, SITE_VERSION: id },
  });
  if (result.status !== 0) {
    console.error(`\nbuild stopped: ${id} failed at "${step}". Nothing after it ran.`);
    process.exit(1);
  }
}

try {
  const only = process.argv[2];
  const ids = only ? [only] : listVersions();
  if (ids.length === 0) throw new VersionError('No version folders in versions/.');
  // Check every settings file before building anything, so one bad file stops the run early.
  for (const id of ids) loadVersion(id);

  // A full build starts from an empty dist/, so a deleted version leaves no old output behind.
  if (!only) rmSync(join(ROOT, 'dist'), { recursive: true, force: true });

  // Pages type-check against the schema type, not one version's data, so one check covers all.
  run('astro check', ids[0], ASTRO, ['check']);
  for (const id of ids) {
    console.log(`\n▶ ${id}: assemble public folder`);
    assemblePublic(id);
    run('astro build', id, ASTRO, ['build']);
    run('verify', id, process.execPath, [
      join(ROOT, 'scripts', 'verify', 'index.mjs'),
      `dist/${id}`,
    ]);
    // TC-G04 (N4): no font requests, every <img> sized. A failure stops the build like verify does.
    run('scan fonts and images', id, process.execPath, [
      join(ROOT, 'scripts', 'assets', 'scan-built.mjs'),
      `dist/${id}`,
    ]);
  }
  const ruleCount = readdirSync(join(ROOT, 'scripts', 'verify', 'rules')).filter((f) =>
    f.endsWith('.mjs'),
  ).length;
  const gap =
    ruleCount < TOTAL_RULES
      ? ` ${ruleCount} of ${TOTAL_RULES} verify rules exist; ENG-07 adds the rest.`
      : '';
  console.log(`\n✓ built and verified: ${ids.join(', ')}.${gap}`);
} catch (err) {
  if (!(err instanceof VersionError)) throw err;
  console.error(err.message);
  process.exit(1);
}
