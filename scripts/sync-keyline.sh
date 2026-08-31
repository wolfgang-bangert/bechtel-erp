#!/usr/bin/env bash
# Inkrementeller Keyline-Abgleich (Aufträge + Rechnungen). Für Cron/launchd.
# Läuft still, schreibt ein Log nach logs/keyline-sync.log.
set -uo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs
LOG="logs/keyline-sync.log"
ts() { date "+%Y-%m-%d %H:%M:%S"; }

{
  echo "── $(ts) Start"
  pnpm --filter sync keyline:orders   || echo "$(ts) keyline:orders FEHLER $?"
  pnpm --filter sync keyline:invoices || echo "$(ts) keyline:invoices FEHLER $?"
  echo "── $(ts) Ende"
} >> "$LOG" 2>&1
