#!/bin/zsh
# Doppelklick im Finder = Kontoumsätze aller eingerichteten Banken abrufen,
# importieren und mit den offenen Rechnungen abgleichen.
# Fenster offen lassen: falls die Bank eine TAN-Freigabe verlangt,
# musst du sie hier bestätigen (in der Banking-App freigeben, dann ENTER).
export PATH="/Users/wolfgangbangert/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/wolfgangbangert/neues ERP" 2>/dev/null || { echo "Projektordner nicht gefunden"; sleep 3; exit 1; }

echo "▸ Banken abrufen …"
echo
pnpm --filter sync fints:pull
status=$?
echo
if [ $status -eq 0 ]; then
  echo "✓ fertig. Ergebnis oben. Dieses Fenster kannst du schließen."
else
  echo "✗ mit Fehler beendet (Code $status). Meldung oben."
fi
echo
read "?ENTER zum Schließen …"
