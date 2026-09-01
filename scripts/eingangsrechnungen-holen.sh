#!/usr/bin/env bash
# Eingangsrechnungen aus dem Postfach holen + per KI vorerfassen.
# Für Cron/launchd; still, Log nach logs/eingangsrechnungen.log.
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs
LOG="logs/eingangsrechnungen.log"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

{
  echo "── $(ts) Start"
  pnpm --filter sync mail:fetch --since=7          || echo "$(ts) mail:fetch FEHLER $?"
  pnpm --filter sync incoming:extract --limit=100  || echo "$(ts) incoming:extract FEHLER $?"
  echo "── $(ts) Ende"
} >> "$LOG" 2>&1
