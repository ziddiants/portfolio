// The verify rule runner (ENG-06, N11). It knows nothing about single rules.
// A rule is a module whose default export is:
//   { id: 'VF-16', title: 'Secrets', needsPrivate: false, run(ctx) { return [finding, …]; } }
// A finding is { file, line?, message, fix }. An empty list means the rule passed.
// ctx is { root, distDir, mode: 'local' | 'ci', staged: string[] | null, privateAvailable }.
//
// The runner fails closed. No rules, a rule that throws, or a rule that returns the wrong shape
// is a failure, never a pass (past mistake: a gate that fails silently).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Loads every rule module in a folder, sorted by file name. */
export async function loadRules(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mjs'))
    .sort();
  const rules = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    rules.push({ ...mod.default, file: f });
  }
  return rules;
}

function badRule(rule) {
  if (!rule || typeof rule.id !== 'string' || typeof rule.run !== 'function') {
    return `rule ${rule?.file ?? '(unknown)'} must export { id, run } as its default`;
  }
  return null;
}

/**
 * Runs the rules. Returns { passed: [id], skipped: [id], findings: [{ rule, … }] }.
 * `required` lists rule ids that must exist. A deleted rule file is then a failure, not a
 * smaller rule set that still passes.
 */
export function runRules(rules, ctx, required = []) {
  const result = { passed: [], skipped: [], findings: [] };
  for (const id of required) {
    if (!rules.some((r) => r.id === id)) {
      result.findings.push({
        rule: id,
        message: 'this required rule is missing from scripts/verify/rules/',
        fix: 'restore the rule file',
      });
    }
  }
  if (rules.length === 0) {
    result.findings.push({
      rule: 'runner',
      message: 'no verify rules were found, so nothing was checked',
      fix: 'restore the rule files in scripts/verify/rules/',
    });
    return result;
  }
  for (const rule of rules) {
    const problem = badRule(rule);
    if (problem) {
      result.findings.push({
        rule: rule?.id ?? 'runner',
        message: problem,
        fix: 'fix the rule file',
      });
      continue;
    }
    if (rule.needsPrivate && !ctx.privateAvailable) {
      if (ctx.mode === 'ci') {
        result.skipped.push(rule.id);
      } else {
        result.findings.push({
          rule: rule.id,
          message: 'this rule needs the private folder, and it is missing (fails closed)',
          fix: 'restore private/ from the vault, or run in CI mode (npm run verify:ci)',
        });
      }
      continue;
    }
    let found;
    try {
      found = rule.run(ctx);
    } catch (err) {
      result.findings.push({
        rule: rule.id,
        message: `the rule crashed: ${err.message}`,
        fix: 'fix the rule; a crash is never a pass',
      });
      continue;
    }
    if (!Array.isArray(found)) {
      result.findings.push({
        rule: rule.id,
        message: 'the rule did not return a list of findings',
        fix: 'return [] when the check passes',
      });
      continue;
    }
    if (found.length === 0) result.passed.push(rule.id);
    for (const f of found) result.findings.push({ rule: rule.id, ...f });
  }
  return result;
}

/** One finding as text: where, what, and how to fix it. */
export function formatFinding(f) {
  const where = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : '';
  return `  ✗ ${f.rule}${where} — ${f.message}\n      fix: ${f.fix}`;
}
