#!/usr/bin/env bash
# demo-complete ループの gate。既存の npm run gate（lint・テスト基準数・build）に制限パス検査を足す
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

BASE="${GATE_BASE:-origin/feat/demo-mode}"
RESTRICTED='^(src/cloud/|supabase/|server/index\.mjs$|server/cloud-draft\.mjs$|api/draft\.mjs$|\.env)'

# コミット済み・未コミット・未追跡の全変更を対象にする
changed=$( { git diff --name-only "$BASE"...HEAD; git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u)
violations=$(printf '%s\n' "$changed" | grep -E "$RESTRICTED")
if [ -n "$violations" ]; then
  echo "Gate BLOCK: restricted paths changed:"
  printf '  %s\n' $violations
  exit 1
fi
echo "Gate: restricted paths untouched"

MIN_TESTS="${GATE_MIN_TESTS:-181}"
out=$(npm run gate 2>&1); status=$?
printf '%s\n' "$out" | tail -20
[ $status -eq 0 ] || { echo "Gate BLOCK: npm run gate failed"; exit 1; }
count=$(printf '%s\n' "$out" | sed -n 's/.*Gate PASS: lint, \([0-9]*\) passing tests.*/\1/p')
if [ -z "$count" ] || [ "$count" -lt "$MIN_TESTS" ]; then
  echo "Gate BLOCK: passing tests ${count:-unknown} < baseline $MIN_TESTS (テスト削除の疑い)"
  exit 1
fi
echo "Gate PASS (demo-complete): $count tests >= $MIN_TESTS"
