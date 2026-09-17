#!/usr/bin/env bash
# Publica commit status local/check (description=base:<sha>) para o workflow
# pular o check remoto quando a prova local existir.
set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
HEAD_SHA="${HEAD_SHA:-$(git rev-parse HEAD)}"
BASE_SHA="${BASE_SHA:-}"

if [[ -z "$BASE_SHA" ]]; then
  if git rev-parse --verify origin/dev >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base HEAD origin/dev)"
  else
    echo "BASE_SHA obrigatório (ou origin/dev presente)" >&2
    exit 1
  fi
fi

DESCRIPTION="base:${BASE_SHA}"
CONTEXT="local/check"

existing="$(gh api "repos/${REPO}/commits/${HEAD_SHA}/status" \
  --jq "[.statuses[] | select(.context == \"${CONTEXT}\" and .state == \"success\" and .description == \"${DESCRIPTION}\")] | length")"

if [[ "$existing" -gt 0 ]]; then
  echo "Já existe: ${CONTEXT} → ${DESCRIPTION} @ ${HEAD_SHA}"
  exit 0
fi

gh api "repos/${REPO}/statuses/${HEAD_SHA}" \
  -f state=success \
  -f "context=${CONTEXT}" \
  -f "description=${DESCRIPTION}" \
  >/dev/null

echo "Attestation publicada: ${CONTEXT} → ${DESCRIPTION} @ ${HEAD_SHA}"
