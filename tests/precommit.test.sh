#!/usr/bin/env bash
# TC-B06 — the pre-commit hook blocks private files (ENG-02, N10/N12).
# Runs against the real repo and the real hook, end to end, then cleans up.
# A gate that emits output is only trusted once it is tested against the event
# it serves, so this stages the forbidden files and runs the hook for real.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2   # repo root

hook=".githooks/pre-commit"
out="$(mktemp)"
fail=0
created=()

cleanup() {
  git reset -q -- . >/dev/null 2>&1 || true
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
    grep -q "$f" "$out" || { bad "hook did not name $f"; all=0; }
  done
  [ "$all" = 1 ] && pass "hook blocked all 4 forbidden files and named each"
fi
git reset -q -- . >/dev/null 2>&1 || true

# 3) A staged non-private file is allowed through.
git add -f package.json
if bash "$hook" >/dev/null 2>&1; then pass "hook allows staged non-private files"; else bad "hook blocked a clean commit"; fi
git reset -q -- . >/dev/null 2>&1 || true

echo ""
if [ "$fail" = 0 ]; then echo "  TC-B06: PASS"; exit 0; else echo "  TC-B06: FAIL"; exit 1; fi
