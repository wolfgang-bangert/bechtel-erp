#!/usr/bin/env bash
# Druckaufträge aus den Kundenportalen holen (Phase 1: onlineprinters, nur lesen).
# Für Cron/launchd; still, Log nach logs/druckauftraege.log.
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs
LOG="logs/druckauftraege.log"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

{
  echo "── $(ts) Start"
  pnpm --filter sync portal:pull --portal=onlineprinters || echo "$(ts) portal:pull FEHLER $?"
  echo "── $(ts) Ende"
} >> "$LOG" 2>&1
