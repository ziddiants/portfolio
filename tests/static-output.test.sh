#!/usr/bin/env bash
# TC-A09 — the build output is static only, and astro check is clean (ENG-03, N14).
# Runs the real build, then proves each guard can fail: a guard that has never
# been seen to fail is not trusted.
# Since ENG-04 the config needs a version, so astro check runs for one (any version type-checks
# the same: pages use the schema type) and the build writes one folder per version.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 2   # repo root

out="$(mktemp)"
tmp="$(mktemp -d)"
probe="src/__tc_a09_probe.ts"
fail=0

cleanup() {
  rm -f "$probe" "$out" >/dev/null 2>&1 || true
  rm -rf "$tmp" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pass() { printf '  \342\234\223 %s\n' "$1"; }
bad()  { printf '  \342\234\227 %s\n' "$1"; fail=1; }

# Prints every server-side file or folder found under $1. Exit 0 = none found.
server_files() {
  local found
  found=$(find "$1" \( -name '_worker.js' -o -name 'functions' \) 2>/dev/null)
  [ -n "$found" ] && { printf '%s\n' "$found"; return 1; }
  return 0
}

# 1) astro check is clean on the real project.
if SITE_VERSION=payments npx astro check >"$out" 2>&1 && grep -q '0 errors' "$out"; then
  pass "astro check reports 0 errors"
else
  bad "astro check is not clean"; sed 's/^/      /' "$out"
fi

# 2) Strict mode is on: an implicit-any parameter must make astro check fail.
printf 'export function probe(x) {\n  return x;\n}\n' > "$probe"
if SITE_VERSION=payments npx astro check >"$out" 2>&1; then
  bad "astro check accepted an implicit-any parameter (strict mode is off)"
else
  pass "astro check rejects an implicit-any parameter (strict mode is on)"
fi
rm -f "$probe"

# 3) The real build succeeds and writes an index page for every version.
rm -rf dist
versions=$(find versions -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
missing=""
# VF-02 and VF-05 need private files; a fake folder with made-up entries stands in (ENG-07).
fake_private="$tmp/private" # removed by the cleanup trap
mkdir -p "$fake_private"
printf '# made up\nZorvath Quell\n' >"$fake_private/names.txt"
printf '| ID | Source |\n| --- | --- |\n| S-001 | test |\n' >"$fake_private/content-sources.md"
# A fake clean résumé per version (D89), holding that version's own approved numbers.
node -e "import('./tests/fake-resumes.mjs').then((m) => m.writeFakeResumes(process.argv[1]))" "$fake_private"
if PORTFOLIO_PRIVATE_DIR="$fake_private" VERIFY_MODE= npm run build >"$out" 2>&1; then
  for id in $versions; do [ -f "dist/$id/index.html" ] || missing="$missing $id"; done
else
  missing="(build failed)"
fi
if [ -n "$versions" ] && [ -z "$missing" ]; then
  pass "npm run build succeeds and writes dist/<id>/index.html for: $(echo $versions)"
else
  bad "npm run build failed or wrote no index page for:$missing"; sed 's/^/      /' "$out"
fi

# 4) The output holds no server-side files.
if found=$(server_files dist); then
  pass "dist/ has no _worker.js and no functions/"
else
  bad "dist/ holds server-side files:"; printf '%s\n' "$found" | sed 's/^/      /'
fi

# 5) The check can fail: plant both in a copy of dist/ and expect it to complain.
cp -R dist "$tmp/dist"
printf '//' > "$tmp/dist/_worker.js"
mkdir -p "$tmp/dist/functions"
if found=$(server_files "$tmp/dist"); then
  bad "the check missed a planted _worker.js and functions/"
elif printf '%s\n' "$found" | grep -q '_worker.js' && printf '%s\n' "$found" | grep -q 'functions'; then
  pass "the check catches a planted _worker.js and functions/"
else
  bad "the check caught only part of what was planted"
fi

# 6) No server adapter in the Astro config (an adapter is how SSR gets in).
# Comment lines are skipped, so the config may explain why there is no adapter.
names_adapter() {
  grep -v '^[[:space:]]*//' "$1" | grep -Eiq 'adapter|@astrojs/(node|cloudflare|netlify|vercel)'
}
if names_adapter astro.config.mjs; then
  bad "astro.config.mjs names a server adapter"
else
  pass "astro.config.mjs has no server adapter"
fi

# 7) The adapter check can fail: plant an adapter and expect it to be caught,
# and expect a comment that only mentions one to be ignored.
printf "import node from '@astrojs/node';\nexport default { adapter: node() };\n" > "$tmp/bad.config.mjs"
printf "// no adapter here\nexport default { output: 'static' };\n" > "$tmp/ok.config.mjs"
if names_adapter "$tmp/bad.config.mjs" && ! names_adapter "$tmp/ok.config.mjs"; then
  pass "the adapter check catches a planted adapter and ignores comments"
else
  bad "the adapter check is wrong (missed a planted adapter, or flagged a comment)"
fi

echo ""
if [ "$fail" = 0 ]; then echo "  TC-A09: PASS"; exit 0; else echo "  TC-A09: FAIL"; exit 1; fi
