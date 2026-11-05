// The passing sample (ENG-07): every rule VF-01–VF-05 and VF-07–VF-15 passes the golden site.
// VF-06 and VF-16 read git and have their own tests (ENG-06).
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { loadRules, runRules } from '../../scripts/verify/runner.mjs';
import { golden } from './golden.mjs';

const RULES_DIR = fileURLToPath(new URL('../../scripts/verify/rules', import.meta.url));
const rules = (await loadRules(RULES_DIR)).filter((r) => !['VF-06', 'VF-16'].includes(r.id));

describe('the golden site', () => {
  test('there are 14 ENG-07 rules', () => {
    expect(rules.map((r) => r.id)).toEqual([
      'VF-01', 'VF-02', 'VF-03', 'VF-04', 'VF-05', 'VF-07', 'VF-08',
      'VF-09', 'VF-10', 'VF-11', 'VF-12', 'VF-13', 'VF-14', 'VF-15',
    ]); // prettier-ignore
  });

  test.each(rules.map((r) => [r.id, r]))('%s passes it', (_, rule) => {
    expect(rule.run(golden())).toEqual([]);
  });

  test('the runner passes all 14 on it, with nothing pending or skipped', () => {
    const r = runRules(rules, golden());
    expect(r.findings).toEqual([]);
    expect(r.passed).toHaveLength(14);
    expect(r.skipped).toEqual([]);
  });
});
