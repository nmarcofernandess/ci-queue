#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
emit="$root/scripts/progress-emit.sh"

cd "$root"

# Opt-in queue admission for this checkout (source CLI; no install cycle).
"$root/node_modules/.bin/tsx" "$root/src/cli.ts" guard --cwd "$root" --config "$root/ci-queue.json" \
  --state "${CI_QUEUE_STATE_DIR:-$HOME/.local/state/local-ci/queue}" --json >/dev/null

eval "$(env | awk -F= '/^VITEST/ { print "unset " $1 }')"

filter_nested_progress() {
  awk '!/^@@(ci-queue|local-ci)-progress/'
}

run_stage() {
  local id="$1"
  local label="$2"
  local script="$3"
  bash "$emit" "$id" "-" "stage" "running" "-" "$label"
  set +e
  npm run "$script" 2>&1 | filter_nested_progress
  local code=$?
  set -e
  if [ "$code" -eq 0 ]; then
    bash "$emit" "$id" "-" "stage" "passed" "-" "$label"
    return 0
  fi
  bash "$emit" "$id" "-" "stage" "failed" "-" "$label"
  exit "$code"
}

run_stage build Build build
run_stage test Test test:prepared
run_stage check-ui "Check UI" check:ui
run_stage browser Browser test:browser
