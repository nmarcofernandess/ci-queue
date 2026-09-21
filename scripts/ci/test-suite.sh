#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
case "$mode" in
  fresh)
    npm run build
    ;;
  prepared)
    ;;
  *)
    echo "uso: test-suite.sh <fresh|prepared>" >&2
    exit 2
    ;;
esac

npm run test:core
npm run test:runtime:prepared
npm run test:ui
npm run test:backend
npm run test:examples
npm run test:release
npm run test:install
