// The verify rule runner (ENG-06, ENG-07, N11). It knows nothing about single rules.
// A rule is a module whose default export is:
//   { id: 'VF-14', title, checks: ['disclaimer', …], needsPrivate: ['names.txt'] | false,
//     pendable?: false, appliesTo?(check, ctx), run(ctx) { return [finding, …]; } }
// pendable: false marks a privacy rule (VF-01–VF-04, VF-06, VF-16): none of its checks can be
// pending, so a privacy finding always stops the build.
// A finding is { check, file, line?, message, fix }. `check` may be left out when the rule has
// only one check. An empty list means the rule passed.
// ctx is { root, distDir, mode: 'local' | 'ci', staged, privateDir, version, others }.
//
// The runner fails closed. No rules, a rule that throws, a wrong shape, an undeclared check or a
// missing private file is a failure, never a pass (past mistake: a gate that fails silently).
//
// Pending checks (D80): `pending` maps 'VF-14/disclaimer' to the ticket that builds what it
// checks. Their findings are reported apart and do not fail the run. A pending check that finds
// nothing fails the run, so the list can only shrink.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateState } from './lib/private.mjs';

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
  if (!Array.isArray(rule.checks) || rule.checks.length === 0) {
    return `rule ${rule.id} must list its checks`;
  }
  if (rule.needsPrivate && !Array.isArray(rule.needsPrivate)) {
    return `rule ${rule.id}: needsPrivate must list file names, such as ['names.txt']`;
  }
  return null;
}

/**
 * Runs the rules. Returns { passed: [id], skipped: [id], findings: [{ rule, check, … }],
 * pending: [{ rule, check, ticket, … }] }.
 * `required` lists rule ids that must exist. A deleted rule file is then a failure, not a
 * smaller rule set that still passes.
 */
export function runRules(rules, ctx, required = [], pending = {}) {
  const result = { passed: [], skipped: [], findings: [], pending: [] };
  const fail = (rule, message, fix, extra = {}) =>
    result.findings.push({ rule, ...extra, message, fix });

  for (const id of required) {
    if (!rules.some((r) => r.id === id)) {
      fail(id, 'this required rule is missing from scripts/verify/rules/', 'restore the rule file');
    }
  }
  for (const key of Object.keys(pending)) {
    const [id, check] = key.split('/');
    const rule = rules.find((r) => r.id === id);
    if (rule && rule.pendable === false) {
      fail(
        id,
        `pending.mjs names "${key}", but ${id} is a privacy rule and can never be pending`,
        'remove the entry: a privacy finding always stops the build',
      );
    } else if (rule && Array.isArray(rule.checks) && !rule.checks.includes(check)) {
      fail(id, `pending.mjs names "${key}", which is not a check of ${id}`, 'fix the entry');
    } else if (!rule && !required.includes(id)) {
      fail(id, `pending.mjs names "${key}", but there is no rule ${id}`, 'fix the entry');
    }
  }
  if (rules.length === 0) {
    fail('runner', 'no verify rules were found, so nothing was checked', 'restore the rule files');
    return result;
  }

  for (const rule of rules) {
    const problem = badRule(rule);
    if (problem) {
      fail(rule?.id ?? 'runner', problem, 'fix the rule file');
      continue;
    }
    const missing = (rule.needsPrivate || [])
      .map((name) => [name, privateState(ctx.privateDir, name)])
      .filter(([, state]) => state !== 'ok');
    if (missing.length > 0) {
      if (ctx.mode === 'ci') {
        result.skipped.push(rule.id);
      } else {
        for (const [name, state] of missing) {
          fail(
            rule.id,
            `this rule needs ${name} in the private folder, and it is ${state} (fails closed)`,
            `add ${name} to ${ctx.privateDir} (or set PORTFOLIO_PRIVATE_DIR), or run npm run verify:ci`,
          );
        }
      }
      continue;
    }

    let found;
    try {
      found = rule.run(ctx);
    } catch (err) {
      fail(rule.id, `the rule crashed: ${err.message}`, 'fix the cause; a crash is never a pass');
      continue;
    }
    if (!Array.isArray(found)) {
      fail(rule.id, 'the rule did not return a list of findings', 'return [] when it passes');
      continue;
    }

    let failed = false;
    const seen = new Set();
    for (const f of found) {
      const check = f.check ?? (rule.checks.length === 1 ? rule.checks[0] : undefined);
      if (!rule.checks.includes(check)) {
        failed = true;
        fail(rule.id, `a finding names an undeclared check "${check}"`, 'declare it or fix it');
        continue;
      }
      seen.add(check);
      const ticket = rule.pendable === false ? undefined : pending[`${rule.id}/${check}`];
      if (ticket) result.pending.push({ rule: rule.id, ...f, check, ticket });
      else {
        failed = true;
        result.findings.push({ rule: rule.id, ...f, check });
      }
    }
    // The ratchet: a pending check that applies here and found nothing must come off the list.
    for (const check of rule.checks) {
      const ticket = pending[`${rule.id}/${check}`];
      const applies = rule.appliesTo ? rule.appliesTo(check, ctx) : true;
      if (ticket && applies && !seen.has(check)) {
        failed = true;
        fail(
          rule.id,
          `pending check ${rule.id}/${check} now passes`,
          `remove '${rule.id}/${check}' from scripts/verify/pending.mjs (owned by ${ticket})`,
          { check },
        );
      }
    }
    if (!failed) result.passed.push(rule.id);
  }
  return result;
}

/** One finding as text: where, what, and how to fix it. */
export function formatFinding(f) {
  const id = f.check ? `${f.rule}/${f.check}` : f.rule;
  const where = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : '';
  return `  ✗ ${id}${where} — ${f.message}\n      fix: ${f.fix}`;
}

/** Pending findings, one line per check: which ticket owns it and how many findings it has. */
export function formatPending(list) {
  const byCheck = new Map();
  for (const f of list) {
    const key = `${f.rule}/${f.check}`;
    const entry = byCheck.get(key) ?? { ticket: f.ticket, count: 0, first: f };
    entry.count++;
    byCheck.set(key, entry);
  }
  return [...byCheck].map(
    ([key, e]) =>
      `  … ${key} pending (${e.ticket}): ${e.count} finding${e.count > 1 ? 's' : ''}, ` +
      `first ${e.first.file || '(build)'} — ${e.first.message}`,
  );
}
