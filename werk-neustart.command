#!/bin/zsh
# Doppelklick im Finder = Dev-Server neu starten.
# Fenster offen lassen, solange der Server laufen soll. Fenster schließen = Server stoppt.

export PATH="/Users/wolfgangbangert/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Projektordner finden: neben dieser Datei, sonst der bekannte Pfad.
here="${0:A:h}"
if [ -f "$here/pnpm-workspace.yaml" ]; then
  cd "$here"
else
  cd "/Users/wolfgangbangert/neues ERP"
fi || exit 1

echo "▸ Port 3000 freimachen …"
pids="$(lsof -nP -tiTCP:3000 -sTCP:LISTEN 2>/dev/null)"
if [ -n "$pids" ]; then
  echo "$pids" | xargs kill 2>/dev/null
  sleep 1
  pids="$(lsof -nP -tiTCP:3000 -sTCP:LISTEN 2>/dev/null)"
  [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null
fi

echo "▸ werk startet … gleich auf  http://localhost:3000"
echo "  (dieses Fenster offen lassen; zum Stoppen einfach schließen)"
echo
exec pnpm --filter web dev
