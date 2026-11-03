// The verify step that every build runs on dist/<id>/.
// STUB (ENG-04, D70): no rules yet. ENG-06 writes the rule runner and ENG-07 the rules; then
// this file runs all 16. It says loudly that it ran nothing, so it is never mistaken for a
// real pass, and it still fails when there is no build to check.
//
// Usage: node scripts/verify/index.mjs <dist folder>
import { existsSync, statSync } from 'node:fs';

const target = process.argv[2];
if (!target || !existsSync(target) || !statSync(target).isDirectory()) {
  console.error(`verify: no build folder at ${target ?? '(none given)'}`);
  process.exit(1);
}
console.log(`verify: STUB — 0 rules ran on ${target} (ENG-06/07 add them)`);
