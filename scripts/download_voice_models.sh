#!/usr/bin/env bash
# Download Piper English voice for local TTS.
# Whisper (faster-whisper) downloads small.en automatically on first transcribe.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIPER_DIR="${ROOT}/models/piper"
BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"

mkdir -p "$PIPER_DIR"

download() {
  local name="$1"
  local dest="${PIPER_DIR}/${name}"
  if [[ -f "$dest" ]]; then
    echo "Already present: ${name}"
    return
  fi
  echo "Downloading ${name}…"
  curl -fL --progress-bar -o "$dest" "${BASE_URL}/${name}"
}

download "en_US-lessac-medium.onnx"
download "en_US-lessac-medium.onnx.json"

echo ""
echo "Piper voice ready in ${PIPER_DIR}"
echo "Whisper model (${AXIOM_WHISPER_MODEL:-small.en}) will download on first transcription."
echo "Optional: install ffmpeg for WebM audio (brew install ffmpeg)"
