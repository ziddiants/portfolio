// Creates the Cloudflare Pages project for every version, if it does not exist yet (V1, ENG-05).
// Safe to run again: a project that exists is left alone.
// If the planned name is taken, it tries "<name>-gupta" and writes the new name and address
// into that version's version.json. Aditya records any such change.
//
// Usage: node scripts/pages-setup.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVersions, loadVersion, VersionError } from '../versions/load.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = process.env.WRANGLER_BIN ?? join(ROOT, 'node_modules', '.bin', 'wrangler');
const FALLBACK_SUFFIX = '-gupta';

function wrangler(args) {
  const r = spawnSync(WRANGLER, args, { cwd: ROOT, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Project name → its "<sub>.pages.dev" address, for every project in the account. */
function listProjects() {
  const r = wrangler(['pages', 'project', 'list', '--json']);
  if (r.status !== 0) throw new Error(`wrangler could not list projects:\n${r.out}`);
  const start = r.out.indexOf('[');
  const rows = JSON.parse(r.out.slice(start));
  const projects = new Map();
  for (const row of rows) {
    const name = row.name ?? row['Project Name'];
    const domains = row.subdomain ?? row['Project Domains'];
    projects.set(name, Array.isArray(domains) ? domains[0] : domains);
  }
  return projects;
}

function create(name) {
  console.log(`  creating ${name} (production branch: main)`);
  // --force keeps classic Pages: without it, Wrangler 4.156.1 hands the command to the Workers
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
    if (!projects.has(name)) {
      let r = create(name);
      if (r.status !== 0 && /already|taken|exists/i.test(r.out)) {
        name = `${name}${FALLBACK_SUFFIX}`;
        console.log(`  name is taken; trying ${name}`);
        r = create(name);
      }
      if (r.status !== 0) throw new Error(`wrangler could not create ${name}:\n${r.out}`);
      projects = listProjects();
    } else {
      console.log('  already exists');
    }

    // Cloudflare can add a suffix to the address when the subdomain is taken. Read the real one.
    const domain = projects.get(name);
    if (!domain) throw new Error(`${name}: project not found after create`);
    const siteUrl = `https://${domain}`;
    if (name !== s.pagesProject || siteUrl !== s.siteUrl) {
      const file = join(s.dir, 'version.json');
      const json = JSON.parse(readFileSync(file, 'utf8'));
      json.pagesProject = name;
      json.siteUrl = siteUrl;
      writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
      changes.push(
        `${s.id}: pagesProject ${s.pagesProject} → ${name}, siteUrl ${s.siteUrl} → ${siteUrl}`,
      );
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
