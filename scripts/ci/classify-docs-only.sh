#!/usr/bin/env bash
set -euo pipefail
seen=0
only_docs=1
while IFS= read -r changed_path || [ -n "$changed_path" ]; do
  [ -n "$changed_path" ] || continue
  seen=1
  case "$changed_path" in
    docs/*) ;;
    *) only_docs=0 ;;
  esac
done
if [ "$seen" -eq 1 ] && [ "$only_docs" -eq 1 ]; then
  printf 'true\n'
else
  printf 'false\n'
fi
