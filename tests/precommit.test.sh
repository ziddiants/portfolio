#!/usr/bin/env bash
# TC-B06 — the pre-commit hook blocks private files and secrets (ENG-02, ENG-06, N10/N11/N12).
# Runs against the real repo and the real hook, end to end, then cleans up.
# A gate that emits output is only trusted once it is tested against the event
# it serves, so this stages the forbidden files and runs the hook for real.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2   # repo root

hook=".githooks/pre-commit"
out="$(mktemp)"
fail=0
created=()
# The test stages files. It saves the index first and puts it back exactly, so anything the
# user had staged before is still staged afterwards (D73).
orig_tree=$(git write-tree)
restore_index() { git read-tree "$orig_tree" >/dev/null 2>&1 || true; }

cleanup() {
  restore_index
  for f in "${created[@]}"; do rm -f "$f" >/dev/null 2>&1 || true; done
  rmdir private .inputs >/dev/null 2>&1 || true
  rm -f "$out" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pass() { printf '  \342\234\223 %s\n' "$1"; }
bad()  { printf '  \342\234\227 %s\n' "$1"; fail=1; }

# 1) core.hooksPath points at .githooks, so git actually runs this hook.
hp=$(git config --get core.hooksPath || echo "")
[ "$hp" = ".githooks" ] && pass "core.hooksPath = .githooks" || bad "core.hooksPath is '$hp', expected .githooks"

# 2) Forbidden files are blocked (force-added past .gitignore to test the worst case).
mkdir -p private .inputs
printf 'x' > PRD.md;             created+=("PRD.md")
printf 'x' > private/names.txt;  created+=("private/names.txt")
printf 'x' > .env;               created+=(".env")
printf 'x' > .inputs/raw.pdf;    created+=(".inputs/raw.pdf")
git add -f PRD.md private/names.txt .env .inputs/raw.pdf

if bash "$hook" >"$out" 2>&1; then
  bad "hook ALLOWED forbidden files (should have blocked)"
else
  all=1
  for f in PRD.md private/names.txt .env .inputs/raw.pdf; do
    grep -q "✗ VF-06/tracked $f" "$out" || { bad "hook did not report $f on a VF-06 line"; all=0; }
  done
  [ "$all" = 1 ] && pass "hook blocked all 4 forbidden files and named each"
fi
restore_index

# 3) A staged non-private file is allowed through.
git add -f package.json
if bash "$hook" >/dev/null 2>&1; then pass "hook allows staged non-private files"; else bad "hook blocked a clean commit"; fi
restore_index

# 4) A staged fake key is blocked (VF-16). The key is made here and is deleted at the end.
leak="tc_b06_leak.txt"
created+=("$leak")
printf 'const k = "ghp_%s";\n' "$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 36)" > "$leak"
git add -f "$leak"
if bash "$hook" >"$out" 2>&1; then
  bad "hook ALLOWED a staged fake key (should have blocked)"
elif grep -q "✗ VF-16/secret $leak.*secret found" "$out"; then
  pass "hook blocked a staged fake key and named the file"
else
  bad "hook blocked, but did not report the secret"; sed 's/^/      /' "$out"
fi
restore_index

# 5) The hook fails closed: with no node on PATH it blocks, it does not wave the commit through.
git add -f package.json
if PATH="/usr/bin:/bin" command -v node >/dev/null 2>&1; then
  printf '  - SKIPPED: node is in /usr/bin, so the no-node case cannot be built here\n'
elif PATH="/usr/bin:/bin" bash "$hook" >"$out" 2>&1; then
  bad "hook ALLOWED a commit with no node (should fail closed)"
else
  grep -q "node is not installed" "$out" && pass "hook fails closed when node is missing" || bad "hook failed, but not with the node message"
fi
restore_index

# 6) A rename to a private name is caught. Plumbing stages the rename without touching the files.
blob=$(git rev-parse HEAD:.nvmrc)
git rm -q --cached .nvmrc
git update-index --add --cacheinfo "100644,$blob,PRD.md"
if bash "$hook" >"$out" 2>&1; then
  bad "hook ALLOWED a file renamed to PRD.md (should have blocked)"
elif grep -q "✗ VF-06/tracked PRD.md" "$out"; then
  pass "hook blocked a file renamed to a private name"
else
  bad "hook blocked, but did not report PRD.md"; sed 's/^/      /' "$out"
fi
restore_index

# 7) A "gitleaks:allow" comment does not hide a secret.
allow="tc_b06_allow.txt"
created+=("$allow")
printf 'const k = "ghp_%s"; // gitleaks:allow\n' "$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 36)" > "$allow"
git add -f "$allow"
if bash "$hook" >"$out" 2>&1; then
  bad "hook ALLOWED a key marked gitleaks:allow (should have blocked)"
elif grep -q "✗ VF-16/secret $allow.*secret found" "$out"; then
  pass "hook ignores gitleaks:allow and blocks the key"
else
  bad "hook blocked, but did not report the secret"; sed 's/^/      /' "$out"
fi
restore_index

# 8) A commit that only deletes a file is allowed (nothing can leak).
git rm -q --cached .nvmrc
if bash "$hook" >/dev/null 2>&1; then pass "hook allows a deletion-only commit"; else bad "hook blocked a deletion-only commit"; fi
restore_index

# 9) The hook fails closed when its script is missing (a crash must block, not pass).
crash_dir=$(mktemp -d)
cp "$hook" "$crash_dir/pre-commit"
( cd "$crash_dir" && git init -q && printf 'x' > a.txt && git add a.txt )
if ( cd "$crash_dir" && bash ./pre-commit ) >"$out" 2>&1; then
  bad "hook ALLOWED a commit when scripts/verify/precommit.mjs was missing (should fail closed)"
else
  pass "hook fails closed when its script is missing"
fi
rm -rf "$crash_dir"

# 10) The test left the index as it found it.
[ "$(git write-tree)" = "$orig_tree" ] && pass "the index is exactly as the test found it" || bad "the index changed"

echo ""
if [ "$fail" = 0 ]; then echo "  TC-B06: PASS"; exit 0; else echo "  TC-B06: FAIL"; exit 1; fi
