#!/usr/bin/env bash
set -euo pipefail

id="${1:?id required}"
parent="${2:?parent required}"
kind="${3:?kind required}"
status="${4:?status required}"
duration="${5:?duration required}"
label="${6:?label required}"
label="${label//$'\t'/ }"
label="${label//$'\r'/ }"
label="${label//$'\n'/ }"

printf '@@ci-queue-progress\t1\tnode\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$id" "$parent" "$kind" "$status" "$duration" "$label"
