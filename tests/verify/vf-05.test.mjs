// VF-05 tests (ENG-07, TC-B05): an entry without sources and a cited ID that is not in the private
// register fail; no content, and a register with no IDs, fail too; the register missing fails
// closed locally and is skipped in CI.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import vf05 from '../../scripts/verify/rules/vf-05.mjs';
import { runRules } from '../../scripts/verify/runner.mjs';
import { golden, privateFiles, ROOT } from './golden.mjs';
import { buildDir, fakePrivate, ids, tempDir } from './helpers.mjs';

/** A copy of the fixture source root with one file added or replaced. */
function rootWith(path, text) {
  const root = buildDir(ROOT);
  writeFileSync(join(root, path), text);
  return root;
}

describe('VF-05 source traceability', () => {
  test('a YAML entry without sources fails', () => {
    const root = rootWith(
      'src/content/home/principles.yaml',
      '- title: A\n  sources: [S-003]\n- title: B\n',
    );
    const found = vf05.run(golden({ root }));
    expect(ids(found)).toEqual(['sources-present src/content/home/principles.yaml']);
    expect(found[0].message).toBe('entry 2 has no sources');
  });

  test('a Markdown file without sources, or with no frontmatter, fails', () => {
    for (const text of ['---\ntitle: Vendrax\n---\nBody', 'No frontmatter at all']) {
      const root = rootWith('src/content/projects/vendrax.md', text);
      expect(ids(vf05.run(golden({ root })))).toEqual([
        'sources-present src/content/projects/vendrax.md',
      ]);
    }
  });

  test('a cited ID that is not in content-sources.md fails, with its line', () => {
    const root = rootWith(
      'src/content/projects/vendrax.md',
      '---\nsources: [S-003]\n---\n\nSee S-999.\n',
    );
    const found = vf05.run(golden({ root }));
    expect(found).toMatchObject([
      { check: 'sources-known', file: 'src/content/projects/vendrax.md', line: 5 },
    ]);
    expect(found[0].message).toBe('cites S-999, which is not in content-sources.md');
  });

  test.each([['[TBD]'], ['[""]'], ['[see notes]'], ['[S-1234]'], ['[S-03]']])(
    'F9: sources %s fails: each item must be an S-### ID from the register',
    (list) => {
      const root = rootWith('src/content/projects/vendrax.md', `---\nsources: ${list}\n---\n`);
      expect(vf05.run(golden({ root })).map((f) => f.check)).toContain('sources-known');
    },
  );

  test('F9: a .json content file is checked too', () => {
    const root = rootWith('src/content/home/extra.json', '[{"title":"x","sources":["S-999"]}]');
    expect(ids(vf05.run(golden({ root })))).toEqual(['sources-known src/content/home/extra.json']);
  });

  test('no content at all is a finding (pending until ENG-10 imports the content pack)', () => {
    expect(ids(vf05.run(golden({ root: tempDir() })))).toEqual(['content-present src/content/']);
  });

  test('a register with no ID in a first table column fails', () => {
    const privateDir = fakePrivate({
      'content-sources.md': 'S-003 is mentioned, but not in a table\n',
    });
    expect(ids(vf05.run(golden({ privateDir })))).toEqual(['sources-known']);
  });

  test('the register missing: fails closed locally, "skipped" in CI', () => {
    const privateDir = fakePrivate({ 'names.txt': privateFiles()['names.txt'] });
    const local = runRules([vf05], golden({ privateDir }));
    expect(local.findings[0].message).toMatch(
      /needs content-sources\.md .* missing \(fails closed\)/,
    );
    expect(runRules([vf05], golden({ privateDir, mode: 'ci' })).skipped).toEqual(['VF-05']);
  });
});
