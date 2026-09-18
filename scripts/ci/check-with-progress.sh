#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
emit="$root/scripts/progress-emit.sh"

cd "$root"

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
run_stage test Test test
run_stage check-ui "Check UI" check:ui
run_stage browser Browser test:browser
