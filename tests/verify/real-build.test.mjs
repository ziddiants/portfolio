// Real-build test (ENG-07, plan review C5, C6): faults planted in an .astro page go through the real
// astro build (Astro escapes "&", Lightning CSS minifies and rewrites the CSS, Vite bundles the
// script), and the verify step still catches each one. A rule that passed only on hand-written
// fixtures would miss what the build really writes. Runs in a temp copy of the repo.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { privateFiles } from './golden.mjs';
import { fakePhone, fakePrivate } from './helpers.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const PHONE = `+91 ${fakePhone()}`;
const FILES = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  cwd: REPO,
  encoding: 'utf8',
})
  .stdout.split('\0')
  .filter((f) => f && existsSync(join(REPO, f)) && lstatSync(join(REPO, f)).isFile());

const PAGE = `---
import version from '@version';
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{version.pageTitle}</title>
    <style is:global>
      .card { background: linear-gradient(#ffffff, #000000); border-radius: 1rem; }
      @media (min-width: 900px) { .card { color: #ff0000; } }
    </style>
  </head>
  <body>
    <h1>Portfolio</h1>
    <p>{version.heroSubline}</p>
    <p>Product Manager · consumer apps & monetization · now building with AI</p>
    <p class="card">A robust plan.</p>
    <p>Call ${PHONE} or ask Kelvaro.</p>
    <script>
      const note = '${'n'.repeat(3000)}';
      document.body.dataset.note = note;
    </script>
  </body>
</html>
`;

let dir;
let out;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'eng07-real-build-'));
  for (const file of FILES) cpSync(join(REPO, file), join(dir, file));
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, 'src', 'pages', 'index.astro'), PAGE);
  const git = (...args) =>
    spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: dir,
    });
  git('init', '-q', '-b', 'main');
  appendFileSync(join(dir, '.git', 'info', 'exclude'), 'node_modules\ndist\n.build\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'test copy');
  const r = spawnSync('node', ['scripts/build-all.mjs', 'payments'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PORTFOLIO_PRIVATE_DIR: fakePrivate({ ...privateFiles(), 'names.txt': 'Kelvaro\n' }),
      VERIFY_MODE: '',
    },
  });
  out = { status: r.status, text: r.stdout + r.stderr };
}, 180_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('faults planted in a real build', () => {
  test('the build stops at verify', () => {
    expect(out.status, out.text).toBe(1);
    expect(out.text).toMatch(/build stopped: payments failed at "verify"/);
  });

  test.each([
    ['VF-01/phone', 'a phone number in the page'],
    ['VF-02/names', 'a listed name in the page'],
    ['VF-03/subline', 'the other subline, written by Astro as &amp;'],
    ['VF-07/phrases', 'a stock phrase in the page'],
    ['VF-09/gradient', 'a gradient after Lightning CSS'],
    ['VF-09/radius', 'a 1rem radius after Lightning CSS'],
    ['VF-09/breakpoint', 'a 900px breakpoint after Lightning CSS'],
    ['VF-09/raw-colour', 'a raw colour after Lightning CSS'],
    ['VF-10/script-size', 'a 3 KB script after Vite bundles it'],
  ])('%s is caught: %s', (check) => {
    expect(out.text).toMatch(new RegExp(`✗ ${check} `));
  });
});
