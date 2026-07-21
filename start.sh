#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""
OLLAMA_PID=""
STARTED_OLLAMA_SERVE=0

# qwen3:4b-instruct is the non-thinking variant: same quality for RAG answers,
# none of the hidden reasoning tokens that made qwen3:4b take 20s+ per reply.
LLM_MODEL="${AXIOM_LLM_MODEL:-qwen3:4b-instruct}"
EMBED_MODEL="${AXIOM_EMBED_MODEL:-nomic-embed-text}"
REINDEX_ON_START="${AXIOM_REINDEX_ON_START:-true}"
OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"

ollama_ready() {
  curl -sf "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1
}

wait_for_ollama() {
  local attempt=0
  local max_attempts=60
  while ! ollama_ready; do
    attempt=$((attempt + 1))
    if [[ "$attempt" -ge "$max_attempts" ]]; then
      echo "Error: Ollama did not become ready at ${OLLAMA_HOST}"
      exit 1
    fi
    sleep 1
  done
}

start_ollama() {
  if ollama_ready; then
    echo "Ollama already running at ${OLLAMA_HOST}"
    return
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    echo "Error: ollama CLI not found. Install from https://ollama.com/download"
    exit 1
  fi

  echo "Starting Ollama server…"
  ollama serve >/dev/null 2>&1 &
  OLLAMA_PID=$!
  STARTED_OLLAMA_SERVE=1
  sleep 1

  if ! ollama_ready && [[ "$(uname -s)" == "Darwin" ]]; then
    echo "Launching Ollama.app (macOS)…"
    if [[ -n "$OLLAMA_PID" ]]; then
      kill "$OLLAMA_PID" 2>/dev/null || true
      wait "$OLLAMA_PID" 2>/dev/null || true
    fi
    OLLAMA_PID=""
    STARTED_OLLAMA_SERVE=0
    open -a Ollama 2>/dev/null || true
  fi

  wait_for_ollama
  echo "Ollama is ready."
}

model_present() {
  local name="$1"
  ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$name"
}

ensure_models() {
  for model in "$LLM_MODEL" "$EMBED_MODEL"; do
    if model_present "$model"; then
      echo "Model present: ${model}"
    else
      echo "Pulling ${model} (first run may take a while)…"
      ollama pull "$model"
    fi
  done
}

warm_models() {
  echo "Loading models into memory…"
  curl -sf "${OLLAMA_HOST}/api/embeddings" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${EMBED_MODEL}\",\"prompt\":\"warmup\"}" >/dev/null \
    || echo "Warning: could not warm embedding model ${EMBED_MODEL}"

  curl -sf "${OLLAMA_HOST}/api/generate" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${LLM_MODEL}\",\"prompt\":\"\",\"stream\":false,\"options\":{\"temperature\":0}}" \
    >/dev/null \
    || echo "Warning: could not warm LLM ${LLM_MODEL}"
}

stop_ollama() {
  if ! command -v ollama >/dev/null 2>&1; then
    return
  fi

  if ollama_ready; then
    echo "Unloading models from memory…"
    ollama stop "$LLM_MODEL" 2>/dev/null || true
    ollama stop "$EMBED_MODEL" 2>/dev/null || true
  fi

  if [[ "$STARTED_OLLAMA_SERVE" -eq 1 && -n "$OLLAMA_PID" ]]; then
    echo "Stopping Ollama server (started by this script)…"
    kill "$OLLAMA_PID" 2>/dev/null || true
    wait "$OLLAMA_PID" 2>/dev/null || true
  fi
}

cleanup() {
  echo ""
  echo "Shutting down Axiom.ios services…"
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  stop_ollama
  wait 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "=== Axiom.ios Local RAG ==="

start_ollama
ensure_models
warm_models

# Python virtual environment.
# Invoke the venv's interpreter by absolute path instead of relying on
# `activate`. A venv bakes its original absolute path into its scripts, so
# activating one after the repo has been moved, renamed, or cloned elsewhere
# breaks PATH and `pip`. Calling "$PY" directly is immune to that.
VENV="$ROOT/backend/.venv"
PY="$VENV/bin/python"

if [[ ! -x "$PY" ]] || ! "$PY" -c 'import sys' >/dev/null 2>&1; then
  if [[ -d "$VENV" ]]; then
    echo "Rebuilding Python virtual environment (stale or broken)…"
    rm -rf "$VENV"
  else
    echo "Creating Python virtual environment…"
  fi
  python3 -m venv "$VENV"
fi

echo "Installing backend dependencies…"
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -r "$ROOT/backend/requirements.txt"

if [[ "$REINDEX_ON_START" == "1" || "$REINDEX_ON_START" == "true" || "$REINDEX_ON_START" == "yes" ]]; then
  echo "Re-indexing knowledge base from data/ …"
  (cd "$ROOT/backend" && "$PY" indexer.py)
else
  echo "Skipping re-index (AXIOM_REINDEX_ON_START=${REINDEX_ON_START})"
fi

# Frontend dependencies
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "Installing frontend dependencies…"
  (cd "$ROOT/frontend" && npm install)
fi

echo "Starting FastAPI backend on http://127.0.0.1:8000 …"
(cd "$ROOT/backend" && "$PY" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload) &
BACKEND_PID=$!

sleep 2

echo "Starting Vite frontend on http://localhost:3000 …"
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

VOICE_MODEL="${ROOT}/models/piper/en_US-lessac-medium.onnx"
if [[ ! -f "$VOICE_MODEL" ]]; then
  echo "  Voice:   models not installed — run ./scripts/download_voice_models.sh for the Voice tab"
else
  echo "  Voice:   local Whisper + Piper ready"
fi

echo ""
echo "Ready:"
echo "  UI:      http://localhost:3000"
echo "  API:     http://127.0.0.1:8000/docs"
echo "  Ollama:  ${OLLAMA_HOST} (${LLM_MODEL}, ${EMBED_MODEL})"
echo "  Press Ctrl+C to stop all services and unload models."
echo ""

wait
