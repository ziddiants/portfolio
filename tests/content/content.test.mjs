// Content model tests (ENG-10): TC-A10 (a one-sentence edit changes one file and reaches the
// synced entry), the schema guards of ERD § Content model, TC-B05 on the real content, and the
// shape of the imported pack. Each sync runs in a temp copy of the repo, never the working tree.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';
import vf05 from '../../scripts/verify/rules/vf-05.mjs';
import { privateDir, privateState } from '../../scripts/verify/lib/private.mjs';
import { citedSourceIds, writeFakeRegister } from '../fake-register.mjs';
import { linkNodeModules } from '../link-node-modules.mjs';
import { ctxFor, git } from '../verify/helpers.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const CARINFO = 'src/content/case-studies/carinfo-payments.md';
const SENTENCE = 'People panic when a payment is stuck.';
const copies = [];

/** A git repo with a copy of what `astro sync` needs, committed, with node_modules linked. */
function repoCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'eng10-'));
  copies.push(dir);
  for (const p of [
    'src',
    'versions',
    'astro.config.mjs',
    'tsconfig.json',
    'package.json',
    '.gitignore',
  ]) {
    cpSync(join(REPO, p), join(dir, p), { recursive: true });
  }
  linkNodeModules(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

function sync(dir) {
  const r = spawnSync('npx', ['astro', 'sync'], {
    cwd: dir,
    env: { ...process.env, SITE_VERSION: 'payments' },
    encoding: 'utf8',
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

const edit = (dir, path, fn) => {
  const p = join(dir, path);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
};

afterAll(() => {
  for (const d of copies) rmSync(d, { recursive: true, force: true });
});

describe('TC-A10 one sentence changes one file', () => {
  test('only that file differs, and the synced entry holds the new sentence', () => {
    const dir = repoCopy();
    expect(sync(dir).status).toBe(0);
    const store = join(dir, 'node_modules', '.astro', 'data-store.json');
    // The store must exist and hold the old sentence, or the check below proves nothing.
    expect(existsSync(store)).toBe(true);
    expect(readFileSync(store, 'utf8')).toContain(SENTENCE);

    edit(dir, CARINFO, (t) => t.replace(SENTENCE, 'People worry when a payment is stuck.'));
    expect(sync(dir).status).toBe(0);
    expect(git(dir, 'status', '--porcelain').stdout.trim().split('\n')).toEqual([`M ${CARINFO}`]);
    const after = readFileSync(store, 'utf8');
    expect(after).toContain('People worry when a payment is stuck.');
    expect(after).not.toContain(SENTENCE);
  });
});

describe('schemas reject bad content at sync time', () => {
  // [file, edit, text Astro prints for that field]: a failure for another reason does not count.
  const guards = {
    'a card problem over 160 characters': [
      CARINFO,
      (t) => t.replace(/^cardProblem: .*$/m, `cardProblem: '${'x'.repeat(161)}'`),
      /cardProblem: Too big/,
    ],
    'a figure with empty alt text': [
      CARINFO,
      (t) => t.replace(/^sources:/m, 'figures:\n  - { src: a.png, alt: "", caption: c }\nsources:'),
      /figures\.0\.alt: Too small/,
    ],
    'a malformed source ID': [
      CARINFO,
      (t) => t.replace('[S-003, S-010, S-011]', '[S-1234]'),
      /sources\.0: Invalid string/,
    ],
    'an entry without sources': [
      CARINFO,
      (t) => t.replace(/^sources: .*\n/m, ''),
      /sources.*Required/,
    ],
    'a project tag other than "1-week sprint"': [
      'src/content/projects/vendrax.md',
      (t) => t.replace("tag: '1-week sprint'", 'tag: sprint'),
      /tag: Invalid input/,
    ],
  };
  for (const [name, [path, change, message]] of Object.entries(guards)) {
    test(`fails on ${name}`, () => {
      const dir = repoCopy();
      const before = readFileSync(join(dir, path), 'utf8');
      edit(dir, path, change);
      // An edit that matched nothing plants no fault; the test would then fail for no reason.
      expect(readFileSync(join(dir, path), 'utf8')).not.toBe(before);
      const r = sync(dir);
      expect(r.status, r.out).not.toBe(0);
      expect(r.out).toMatch(message);
    });
  }
});

describe('TC-B05 on the real content', () => {
  test('VF-05 finds nothing against a register that lists the cited IDs', () => {
    const priv = mkdtempSync(join(tmpdir(), 'eng10-priv-'));
    copies.push(priv);
    writeFakeRegister(priv);
    expect(vf05.run(ctxFor(REPO, { privateDir: priv }))).toEqual([]);
  });

  test('VF-05 reports an ID that is missing from the register (the fake is not circular)', () => {
    const priv = mkdtempSync(join(tmpdir(), 'eng10-priv-'));
    copies.push(priv);
    writeFakeRegister(priv);
    const [missing] = citedSourceIds();
    const register = join(priv, 'content-sources.md');
    writeFileSync(
      register,
      readFileSync(register, 'utf8')
        .split('\n')
        .filter((l) => !l.startsWith(`| ${missing} |`))
        .join('\n'),
    );
    const found = vf05.run(ctxFor(REPO, { privateDir: priv }));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.check === 'sources-known')).toBe(true);
    expect(found.some((f) => f.message.includes(missing))).toBe(true);
  });

  // CI has no private folder, so this one is skipped there (like VF-02). The local build with the
  // private folder is the gate for real IDs.
  test('VF-05 finds nothing against the real register', (ctx) => {
    const dir = privateDir();
    if (privateState(dir, 'content-sources.md') !== 'ok') {
      console.log('skipped: no private content-sources.md (as in CI)');
      return ctx.skip();
    }
    expect(vf05.run(ctxFor(REPO, { privateDir: dir }))).toEqual([]);
  });
});

describe('the imported pack', () => {
  const read = (p) => readFileSync(join(REPO, 'src', 'content', p), 'utf8');
  const names = (d) => readdirSync(join(REPO, 'src', 'content', d)).sort();
  const files = () =>
    ['home', 'case-studies', 'projects'].flatMap((d) =>
      names(d).map((n) => join('src', 'content', d, n)),
    );

  test('has the planned entries', () => {
    expect(names('case-studies')).toEqual([
      'carinfo-payments.md',
      'google-pay-resolution-tracker.md',
    ]);
    expect(names('projects')).toEqual(['nyaysetu.md', 'skooling.md', 'vendrax.md']);
    expect(parseYaml(read('home/principles.yaml'))).toHaveLength(5);
    expect(parseYaml(read('home/toolkit.yaml'))).toHaveLength(5);
  });

  test('the CarInfo page has no "How AI was used" heading', () => {
    expect(read('case-studies/carinfo-payments.md')).not.toMatch(/^## How AI was used/m);
  });

  test('D92: the ₹20–25L bullet is nowhere', () => {
    for (const f of files()) {
      expect(readFileSync(join(REPO, f), 'utf8'), f).not.toMatch(
        /20\s*(?:[–—−-]|to)\s*25\s*(?:L|lakh|lac)/i,
      );
    }
  });
});
