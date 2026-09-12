#!/bin/zsh
# Doppelklick im Finder = onlineprinters-Aufträge jetzt abrufen (statt auf
# den 05:30-Automatiklauf zu warten): neue Aufträge holen, Status offener
# Aufträge nachziehen, PDFs analysieren, Materialauflösung + Jobs/Batches.
export PATH="/Users/wolfgangbangert/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/wolfgangbangert/neues ERP" 2>/dev/null || { echo "Projektordner nicht gefunden"; sleep 3; exit 1; }

if pgrep -f "cli.ts portal:pull" >/dev/null 2>&1; then
  echo "▸ Es läuft schon ein Abruf (z. B. der automatische von heute früh)."
  echo "  Bitte kurz warten und danach nochmal starten."
  echo
  read "?ENTER zum Schließen …"
  exit 0
fi

echo "▸ onlineprinters-Aufträge abrufen …"
echo
pnpm --filter sync portal:pull --portal=onlineprinters
status=$?
echo
if [ $status -eq 0 ]; then
  echo "✓ fertig — Ergebnis oben. Neue/aktualisierte Aufträge stehen unter /druckauftraege und /druck."
else
  echo "✗ mit Fehler beendet (Code $status). Meldung oben."
fi
echo
read "?ENTER zum Schließen …"
