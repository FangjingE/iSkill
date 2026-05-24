#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DB_PATH="${DB_PATH:-$PROJECT_DIR/data/iskills.db}"

cd "$PROJECT_DIR"
exec "$PYTHON_BIN" server.py --host "$HOST" --port "$PORT" --db-path "$DB_PATH"
