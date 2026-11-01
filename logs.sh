#!/usr/bin/env bash

# AutoQA Live Logs Viewer
LOGS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/logs"
mkdir -p "$LOGS_DIR"
touch "$LOGS_DIR/server.log" "$LOGS_DIR/worker.log" "$LOGS_DIR/frontend.log" "$LOGS_DIR/app-under-test.log"

case "$1" in
  worker)
    echo " Streaming worker logs (logs/worker.log)..."
    tail -f "$LOGS_DIR/worker.log"
    ;;
  server|backend)
    echo " Streaming backend server logs (logs/server.log)..."
    tail -f "$LOGS_DIR/server.log"
    ;;
  frontend)
    echo " Streaming frontend logs (logs/frontend.log)..."
    tail -f "$LOGS_DIR/frontend.log"
    ;;
  app)
    echo " Streaming target app logs (logs/app-under-test.log)..."
    tail -f "$LOGS_DIR/app-under-test.log"
    ;;
  *)
    echo " Streaming ALL live logs (server, worker, frontend, app-under-test)..."
    echo "Usage: ./logs.sh [worker|server|frontend|app]"
    tail -f "$LOGS_DIR/server.log" "$LOGS_DIR/worker.log" "$LOGS_DIR/frontend.log" "$LOGS_DIR/app-under-test.log"
    ;;
esac

