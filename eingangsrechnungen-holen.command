#!/bin/zsh
# Doppelklick im Finder = Eingangsrechnungen aus dem Postfach holen + vorerfassen.
export PATH="/Users/wolfgangbangert/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/wolfgangbangert/neues ERP" 2>/dev/null || { echo "Projektordner nicht gefunden"; sleep 3; exit 1; }

echo "▸ Postfach abrufen …"
pnpm --filter sync mail:fetch --since=7
echo
echo "▸ per KI vorerfassen …"
pnpm --filter sync incoming:extract --limit=100
echo
echo "✓ fertig — Ergebnis oben. Prüfen unter /eingangsrechnungen."
sleep 2
