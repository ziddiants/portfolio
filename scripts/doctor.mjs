#!/usr/bin/env node
// doctor — environment health check for the portfolio build (ENG-01).
// Checks each tool, both logins, and that the vault symlink resolves (D64).
// Exit 0 only when every hard check passes. Warnings do not fail the run.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const noColor = process.env.NO_COLOR || !process.stdout.isTTY;
const paint = (code, s) => (noColor ? s : `\x1b[${code}m${s}\x1b[0m`);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);
const yellow = (s) => paint('33', s);
const dim = (s) => paint('2', s);

const results = []; // { name, status: 'ok'|'fail'|'warn', detail, fix }
const add = (name, status, detail, fix) => results.push({ name, status, detail, fix });

const firstLine = (s) => (s || '').split('\n')[0].trim();
const expandTilde = (p) => (p.startsWith('~') ? path.join(HOME, p.slice(1)) : p);

// Run a command, capturing stdout+stderr. ENOENT => not found.
function probe(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  if (r.error && r.error.code === 'ENOENT') return { found: false, out: '', code: null };
  const text = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { found: true, out: firstLine(text), code: r.status };
}

function parseSemver(s) {
  const m = (s || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function gte(a, b) {
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
}

// --- Tools -----------------------------------------------------------------
const tools = [
  { name: 'node', cmd: 'node', args: ['--version'], min: [22, 23, 4], fix: 'Install Node 24 (nvm install 24) — see .nvmrc' },
  { name: 'npm', cmd: 'npm', args: ['--version'], fix: 'Ships with Node; reinstall Node' },
  { name: 'git', cmd: 'git', args: ['--version'], fix: 'xcode-select --install' },
  { name: 'gh', cmd: 'gh', args: ['--version'], fix: 'brew install gh' },
  { name: 'pdftotext (poppler)', cmd: 'pdftotext', args: ['-v'], fix: 'brew install poppler' },
  { name: 'pdfinfo (poppler)', cmd: 'pdfinfo', args: ['-v'], fix: 'brew install poppler' },
  { name: 'exiftool', cmd: 'exiftool', args: ['-ver'], fix: 'brew install exiftool' },
  { name: 'qpdf', cmd: 'qpdf', args: ['--version'], fix: 'brew install qpdf' },
  { name: 'gitleaks', cmd: 'gitleaks', args: ['version'], fix: 'brew install gitleaks' },
  { name: 'LibreOffice (soffice)', cmd: 'soffice', args: ['--version'], fix: 'brew install --cask libreoffice' },
];

for (const t of tools) {
  const r = probe(t.cmd, t.args);
  if (!r.found) {
    add(t.name, 'fail', 'not found', t.fix);
    continue;
  }
  if (t.min) {
    const v = parseSemver(r.out);
    if (v && !gte(v, t.min)) {
      add(t.name, 'fail', `${r.out} — need >= ${t.min.join('.')}`, t.fix);
      continue;
    }
  }
  add(t.name, 'ok', r.out || 'present');
}

// --- Logins ----------------------------------------------------------------
// gh: an exit of 0 from `gh auth status` means an active login.
const gh = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 15000 });
if (gh.error && gh.error.code === 'ENOENT') {
  add('gh login', 'fail', 'gh not installed', 'brew install gh && gh auth login');
} else if (gh.status === 0) {
  const acct = firstLine((`${gh.stdout || ''}${gh.stderr || ''}`.match(/account\s+(\S+)/i) || [])[1] || 'active');
  add('gh login', 'ok', acct === 'active' ? 'logged in' : `logged in (${acct})`);
} else {
  add('gh login', 'fail', 'not logged in', 'gh auth login');
}

// wrangler: a stored OAuth token proves ADI-01's login (checked offline).
// Wrangler becomes a project dependency at ENG-05; the deeper `wrangler whoami`
// check lands there. Here we read the credential file directly.
const wranglerTomls = [
  path.join(HOME, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml'),
  path.join(HOME, '.config', '.wrangler', 'config', 'default.toml'),
];
const wToml = wranglerTomls.find((p) => fs.existsSync(p));
if (wToml && /oauth_token\s*=/.test(fs.readFileSync(wToml, 'utf8'))) {
  add('wrangler login', 'ok', 'OAuth token stored');
} else {
  add('wrangler login', 'fail', 'no stored token', 'npx wrangler login');
}

// --- Vault symlink (D64) ---------------------------------------------------
// <vault_path>/portfolio from ~/.shipstack/config.yaml must resolve to the
// private vault at ~/my_builds/portfolio.
try {
  const cfgPath = path.join(HOME, '.shipstack', 'config.yaml');
  const cfg = fs.readFileSync(cfgPath, 'utf8');
  const m = cfg.match(/^\s*vault_path:\s*(.+?)\s*$/m);
  if (!m) {
    add('vault symlink', 'fail', 'vault_path not set in ~/.shipstack/config.yaml', 'Add vault_path: ~/ProductBrain/Projects');
  } else {
    const vaultPath = expandTilde(m[1].replace(/['"]/g, '').trim());
    const linkPath = path.join(vaultPath, 'portfolio');
    const expected = path.join(HOME, 'my_builds', 'portfolio');
    const actual = fs.realpathSync(linkPath);
    if (actual === fs.realpathSync(expected)) {
      add('vault symlink', 'ok', `${linkPath} -> ${actual}`);
    } else {
      add('vault symlink', 'fail', `resolves to ${actual}, expected ${expected}`, `ln -s ${expected} ${linkPath}`);
    }
  }
} catch (e) {
  add('vault symlink', 'fail', e.message, 'Create the symlink: ln -s ~/my_builds/portfolio ~/ProductBrain/Projects/portfolio');
}

// --- Playwright browsers (warn only — needed by M4, ENG-25) ----------------
const pwCache = path.join(HOME, 'Library', 'Caches', 'ms-playwright');
let pwReady = false;
try {
  pwReady = fs.existsSync(pwCache) && fs.readdirSync(pwCache).some((d) => /chromium|firefox|webkit/i.test(d));
} catch {
  pwReady = false;
}
if (pwReady) add('Playwright browsers', 'ok', 'installed');
else add('Playwright browsers', 'warn', 'not installed — needed by M4', 'At M4: npx playwright install');

// --- Report ----------------------------------------------------------------
const sym = { ok: green('✓'), fail: red('✗'), warn: yellow('⚠') };
const pad = Math.max(...results.map((r) => r.name.length));
console.log('\n  portfolio doctor\n');
for (const r of results) {
  const line = `  ${sym[r.status]}  ${r.name.padEnd(pad)}  ${dim(r.detail)}`;
  console.log(line);
  if (r.status !== 'ok' && r.fix) console.log(`       ${dim('fix:')} ${r.fix}`);
}

const fails = results.filter((r) => r.status === 'fail');
const warns = results.filter((r) => r.status === 'warn');
console.log('');
if (fails.length === 0) {
  console.log(`  ${green('All green.')}${warns.length ? yellow(`  (${warns.length} warning${warns.length > 1 ? 's' : ''})`) : ''}\n`);
  process.exit(0);
} else {
  console.log(`  ${red(`${fails.length} check${fails.length > 1 ? 's' : ''} failed.`)} Fix the lines above, then re-run ${dim('npm run doctor')}.\n`);
  process.exit(1);
}
