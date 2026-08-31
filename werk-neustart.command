#!/bin/zsh
# Doppelklick im Finder = Dev-Server neu starten und Browser öffnen.
export PATH="/Users/wolfgangbangert/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "/Users/wolfgangbangert/neues ERP" 2>/dev/null || { echo "Projektordner nicht gefunden"; sleep 3; exit 1; }
bash scripts/restart-web.sh
echo
echo "Fertig. Dieses Fenster kannst du schließen — der Server läuft weiter."
sleep 2
