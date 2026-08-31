#!/usr/bin/env bash
# Dev-Server neu starten: Port freimachen, im Hintergrund starten, Browser öffnen.
# Aufruf:  pnpm restart   (oder Doppelklick werk-neustart.command)
set -uo pipefail

PORT="${PORT:-3000}"
cd "$(dirname "$0")/.."
mkdir -p logs
LOG="logs/web-dev.log"

pids="$(lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${pids}" ]; then
  echo "▸ alten Server beenden (Port ${PORT}) …"
  echo "${pids}" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

echo "▸ werk startet im Hintergrund … (Log: ${LOG})"
nohup pnpm --filter web dev > "${LOG}" 2>&1 &

for _ in $(seq 1 40); do
  sleep 1
  if curl -sf -o /dev/null "http://localhost:${PORT}"; then
    echo "▸ läuft:  http://localhost:${PORT}"
    command -v open >/dev/null && open "http://localhost:${PORT}"
    exit 0
  fi
done
echo "✗ Server nicht rechtzeitig erreichbar — ${LOG} ansehen."
exit 1
