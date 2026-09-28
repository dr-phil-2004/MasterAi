#!/usr/bin/env bash
# Prépare la session web : installe les dépendances si besoin.
set -e
cd "$(git rev-parse --show-toplevel)"
if [ ! -d node_modules ]; then
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile || pnpm install
fi
echo "MasterAI prêt. Tests du cœur : pnpm --filter @masterai/core test"
