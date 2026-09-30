#!/usr/bin/env bash
# Read-only check that the live PR still matches (repo, H, B0) and that the
# latest commit status for the configured context is success with description
# base:<B0>. Later failure/pending outranks an older success.
set -euo pipefail

repo="${repo:?repo is required}"
H="${H:?H is required}"
B0="${B0:?B0 is required}"
context="${context:?context is required}"
pr="${pr:?pr is required}"

if ! printf '%s' "$repo" | grep -Eq '^[^/]+/[^/]+$'; then
  echo "invalid repo" >&2
  exit 1
fi
if ! printf '%s' "$H" | grep -Eq '^[0-9a-fA-F]{40,64}$'; then
  echo "invalid H" >&2
  exit 1
fi
if ! printf '%s' "$B0" | grep -Eq '^[0-9a-fA-F]{40,64}$'; then
  echo "invalid B0" >&2
  exit 1
fi
if [ -z "$context" ]; then
  echo "invalid context" >&2
  exit 1
fi
if [ "${context#*$'\n'}" != "$context" ]; then
  echo "invalid context" >&2
  exit 1
fi
if ! printf '%s' "$pr" | grep -Eq '^[0-9]+$'; then
  echo "invalid pr" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if ! gh api "repos/${repo}/pulls/${pr}" >"$tmp/pr.json"; then
  echo "GitHub API error" >&2
  exit 1
fi
if ! gh api "repos/${repo}/commits/${H}/statuses" >"$tmp/statuses.json"; then
  echo "GitHub API error" >&2
  exit 1
fi

export H B0 context
python3 - "$tmp/pr.json" "$tmp/statuses.json" <<'PY'
import json
import os
import sys

pr_path, statuses_path = sys.argv[1], sys.argv[2]
head = os.environ["H"]
base = os.environ["B0"]
context = os.environ["context"]

with open(pr_path, encoding="utf-8") as handle:
    pr = json.load(handle)
with open(statuses_path, encoding="utf-8") as handle:
    statuses = json.load(handle)

if not isinstance(pr, dict):
    sys.stderr.write("invalid pull request payload\n")
    sys.exit(1)
if pr.get("draft") is True:
    sys.stderr.write("pull request attempt skipped (draft)\n")
    sys.exit(1)
if pr.get("state") != "open":
    sys.stderr.write("pull request is not open\n")
    sys.exit(1)
live_head = (pr.get("head") or {}).get("sha") if isinstance(pr.get("head"), dict) else None
live_base = (pr.get("base") or {}).get("sha") if isinstance(pr.get("base"), dict) else None
if live_head != head:
    sys.stderr.write("head SHA does not match H\n")
    sys.exit(1)
if live_base != base:
    sys.stderr.write("base moved\n")
    sys.exit(1)

if not isinstance(statuses, list):
    sys.stderr.write("invalid statuses payload\n")
    sys.exit(1)

matched = [item for item in statuses if isinstance(item, dict) and item.get("context") == context]
if not matched:
    sys.stderr.write("attestation missing for context\n")
    sys.exit(1)

def recency(item):
    stamp = item.get("updated_at") or item.get("created_at") or ""
    ident = item.get("id") or 0
    try:
        ident = int(ident)
    except (TypeError, ValueError):
        ident = 0
    return (str(stamp), ident)

matched.sort(key=recency)
latest = matched[-1]
state = latest.get("state")
if state != "success":
    label = state if isinstance(state, str) and state else "unknown"
    sys.stderr.write(f"latest attestation is {label}\n")
    sys.exit(1)
expected = f"base:{base}"
if latest.get("description") != expected:
    sys.stderr.write("attestation description does not match B0\n")
    sys.exit(1)
sys.exit(0)
PY
