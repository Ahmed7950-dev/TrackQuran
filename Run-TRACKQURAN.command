#!/bin/bash
# Double-click this file (in Finder) to launch TRACKQURAN locally.
# It serves the built app from ./dist on http://localhost:4173
# and opens it in your default browser.

set -e
cd "$(dirname "$0")"

PORT=4173
DIST_DIR="dist"

if [ ! -f "$DIST_DIR/index.html" ]; then
  echo "Build not found. Building app first..."
  npm install
  npm run build
fi

# If something is already on the port, just open the browser.
if lsof -i ":$PORT" >/dev/null 2>&1; then
  echo "A server is already running on port $PORT. Opening browser..."
  open "http://localhost:$PORT"
  exit 0
fi

# Pick a server: prefer python3 (ships with macOS), fall back to npx serve.
if command -v python3 >/dev/null 2>&1; then
  SERVER_CMD=(python3 -m http.server "$PORT" --directory "$DIST_DIR" --bind 127.0.0.1)
elif command -v npx >/dev/null 2>&1; then
  SERVER_CMD=(npx --yes serve -l "$PORT" "$DIST_DIR")
else
  echo "Neither python3 nor npx is available. Please install Node.js or Python 3."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

echo "Starting TRACKQURAN on http://localhost:$PORT ..."
echo "Close this window to stop the app."
( sleep 1 && open "http://localhost:$PORT" ) &
exec "${SERVER_CMD[@]}"
