// Local preview of one version: assembles its public folder, then runs astro dev for it.
//
// Usage: npm run dev:payments, npm run dev:consumer, or npm run dev -- <id> for any version.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VersionError } from '../versions/load.mjs';
import { assemblePublic } from './assemble-public.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const id = process.argv[2];
if (!id) {
  console.error('Pick a version: npm run dev:payments, or npm run dev -- <id>.');
  process.exit(1);
}
try {
  assemblePublic(id);
} catch (err) {
  if (!(err instanceof VersionError)) throw err;
  console.error(err.message);
  process.exit(1);
}
const result = spawnSync(join(ROOT, 'node_modules', '.bin', 'astro'), ['dev'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, SITE_VERSION: id },
});
process.exit(result.status ?? 1);
