#!/usr/bin/env bash
# Dev-Server (apps/web) neu starten: Port freimachen, dann neu hochfahren.
# Aufruf:  pnpm restart        (oder direkt: bash scripts/restart-web.sh)
set -euo pipefail

PORT="${PORT:-3000}"
cd "$(dirname "$0")/.."

echo "→ Port ${PORT} freimachen …"
pids="$(lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${pids}" ]; then
  echo "${pids}" | xargs kill 2>/dev/null || true
  sleep 1
  pids="$(lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "${pids}" ] && echo "${pids}" | xargs kill -9 2>/dev/null || true
fi

echo "→ Next-Dev-Server starten … http://localhost:${PORT}"
exec pnpm --filter web dev
