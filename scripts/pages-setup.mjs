// Creates the Cloudflare Pages project for every version that has none yet (V1, ENG-05).
// Safe to run again. A project that exists is left alone.
// If Cloudflare refuses the planned name, the script stops. Pick a new name by hand, or run it
// with --allow-fallback. It then tries "<name>-gupta" and writes the new name and address into
// that version's version.json. Aditya records the change in the build plan.
//
// Usage: node scripts/pages-setup.mjs [--allow-fallback]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVersions, loadVersion, VersionError } from '../versions/load.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = process.env.WRANGLER_BIN ?? join(ROOT, 'node_modules', '.bin', 'wrangler');
const FALLBACK_SUFFIX = '-gupta';
const allowFallback = process.argv.includes('--allow-fallback');

function wrangler(args) {
  const r = spawnSync(WRANGLER, args, { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Project name → its "<sub>.pages.dev" address, for every project in the account. */
function listProjects() {
  const r = wrangler(['pages', 'project', 'list', '--json']);
  if (r.status !== 0) throw new Error(`wrangler could not list projects:\n${r.out}`);
  // The JSON is on stdout. A banner line may come first, so start at the first line with "[".
  const lines = r.stdout.split('\n');
  const first = lines.findIndex((l) => l.startsWith('['));
  if (first === -1) throw new Error(`wrangler gave no project list:\n${r.out}`);
  const projects = new Map();
  for (const row of JSON.parse(lines.slice(first).join('\n'))) {
    const domains = row.subdomain ?? row['Project Domains'];
    projects.set(row.name ?? row['Project Name'], Array.isArray(domains) ? domains[0] : domains);
  }
  return projects;
}

function create(name) {
  console.log(`  creating ${name} (production branch: main)`);
  // --force keeps classic Pages. Without it, Wrangler 4.156.1 hands the command to the Workers
  // flow, which fails here (D72). The flag is not in `--help`.
  return wrangler(['pages', 'project', 'create', name, '--production-branch', 'main', '--force']);
}

try {
  const ids = listVersions();
  if (ids.length === 0) throw new VersionError('No version folders in versions/.');
  const settings = ids.map((id) => loadVersion(id));
  let projects = listProjects();
  const changes = [];

  for (const s of settings) {
    console.log(`\n▶ ${s.id}: ${s.pagesProject}`);
    let name = s.pagesProject;
    if (projects.has(name)) {
      console.log('  already exists');
    } else {
      let r = create(name);
      if (r.status !== 0 && allowFallback) {
        name = `${name}${FALLBACK_SUFFIX}`;
        console.log(`  create failed; --allow-fallback is set, so trying ${name}`);
        r = create(name);
      }
      if (r.status !== 0) {
        throw new Error(
          `wrangler could not create ${name}:\n${r.out}\n` +
            'If the name is taken, pick another name or run with --allow-fallback.',
        );
      }
      projects = listProjects();
    }

    const domain = projects.get(name);
    if (!domain) throw new Error(`${name}: project not found after create`);
    const siteUrl = `https://${domain}`;
    if (name !== s.pagesProject) {
      // Only the fallback path changes version.json.
      const file = join(s.dir, 'version.json');
      const json = JSON.parse(readFileSync(file, 'utf8'));
      json.pagesProject = name;
      json.siteUrl = siteUrl;
      writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      changes.push(`${s.id}: ${s.pagesProject} → ${name}, ${s.siteUrl} → ${siteUrl}`);
    } else if (siteUrl !== s.siteUrl) {
      // Cloudflare adds a suffix when the subdomain is taken. The canonical address is public,
      // so a person decides what to do.
      throw new Error(`${s.id}: Cloudflare address is ${siteUrl}, but siteUrl says ${s.siteUrl}.`);
    }
    console.log(`  ✓ ${name} → ${siteUrl}`);
  }

  if (changes.length > 0) {
    console.log('\nversion.json changed. Record this in the build plan and commit it:');
    for (const c of changes) console.log(`  ${c}`);
  }
} catch (err) {
  if (err instanceof VersionError) console.error(err.message);
  else console.error(`pages-setup stopped: ${err.message}`);
  process.exit(1);
}
