#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -d "$ROOT/backend/.venv" ]]; then
  echo "Virtual environment not found. Run ./start.sh once first, or create it manually."
  python3 -m venv "$ROOT/backend/.venv"
fi
# shellcheck source=/dev/null
source "$ROOT/backend/.venv/bin/activate"
pip install -q -r "$ROOT/backend/requirements.txt"

echo "=== Axiom.ios Full Re-index ==="
cd "$ROOT/backend"
python indexer.py
