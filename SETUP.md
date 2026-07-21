# Axiom.ios — Setup & Operations

## Prerequisites

1. **Python 3.11+**
   ```bash
   python3 --version
   ```

2. **Node.js 18+** (for the React frontend)
   ```bash
   node --version
   ```

3. **Ollama** running locally with required models:
   ```bash
   ollama list
   ```
   You should see:
   - `qwen3:4b-instruct` — inference / answers
   - `nomic-embed-text` — embeddings

   If missing:
   ```bash
   ollama pull qwen3:4b-instruct
   ollama pull nomic-embed-text
   ```

4. Verify Ollama is reachable (optional — `./start.sh` does this for you):
   ```bash
   curl http://localhost:11434/api/tags
   ```

## Quick Start

From the project root:

```bash
chmod +x start.sh embed.sh
./start.sh
```

`start.sh` will:

1. Start Ollama if it is not already running (`ollama serve`, or `Ollama.app` on macOS)
2. Pull `qwen3:4b-instruct` and `nomic-embed-text` if they are missing
3. Load both models into memory (warmup)
4. **Re-index** all files under `data/` into ChromaDB (same as `./embed.sh`)
5. Start the FastAPI backend and Vite frontend

Set `AXIOM_REINDEX_ON_START=false` to skip step 4 on startup (faster boot if the index is already current).

On **Ctrl+C**, it stops the backend/frontend, unloads both models (`ollama stop`), and shuts down the Ollama server **only if this script started it**. If you were already running Ollama.app, the app stays open but models are unloaded.

Override models with env vars: `AXIOM_LLM_MODEL`, `AXIOM_EMBED_MODEL`.

Then open **http://localhost:3000** in your browser.

- **Ask** — query your knowledge base; answers stream in with citations
- **Voice** — local English voice chat (Whisper + Piper + RAG)
- **Train** — browse/preview knowledge files; paste notes or a page URL
  (URLs are scraped and indexed automatically)
- **Friday** — full-screen voice assistant persona; ask for "news" or a
  "world update" to get a briefing summarized from public RSS feeds

## Voice chat (local, English)

One-time setup for speech models:

```bash
chmod +x scripts/download_voice_models.sh
./scripts/download_voice_models.sh
```

Optional but recommended for WebM microphone clips:

```bash
brew install ffmpeg
```

The first transcription also downloads the Whisper `small.en` model into `models/whisper/`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `AXIOM_WHISPER_MODEL` | `small.en` | faster-whisper model |
| `AXIOM_PIPER_VOICE` | `models/piper/en_US-lessac-medium.onnx` | Piper voice path |
| `AXIOM_VOICE_ENABLED` | `true` | Set `false` to disable voice routes |

Voice API: `GET /api/voice/status`, `POST /api/voice/transcribe`, `POST /api/voice/speak`. Ask requests from voice use `voice: true` for shorter spoken answers.

## Manual Re-index

`./start.sh` already re-indexes on each run by default. To re-embed manually without restarting services:

```bash
./embed.sh
```

This **safely clears** the ChromaDB collection (`axiom_knowledge`) and rebuilds it from disk, so deleted or renamed files cannot leave stale vectors behind.

Per-file updates (Train tab or `index_file`) only replace chunks for that specific source path.

## API Endpoints

| Endpoint       | Method | Description                          |
|----------------|--------|--------------------------------------|
| `/api/health`  | GET    | Service health check                 |
| `/api/status`  | GET    | Ollama + model readiness (header dots) |
| `/api/ask`     | POST   | RAG question → answer + sources      |
| `/api/ask/stream` | POST | Same, streamed as NDJSON (sources event, then token deltas) |
| `/api/train`   | POST   | Save note + index into ChromaDB      |
| `/api/train/url` | POST | Scrape a web page → save + index     |
| `/api/train/files` | GET | List knowledge files in `data/notes/` |
| `/api/train/files/{name}` | GET | File content for preview      |
| `/api/voice/status` | GET | STT/TTS model readiness           |
| `/api/voice/transcribe` | POST | Audio → English text          |
| `/api/voice/speak` | POST | Text → WAV audio                 |
| `/api/friday/greeting` | GET | Time-of-day greeting line      |
| `/api/friday/ask` | POST | Friday persona answer (+ news briefing when asked) |

Interactive docs: **http://127.0.0.1:8000/docs**

## Adding Knowledge

1. **Train tab** — paste text and click *Commit*
2. **Train tab (URL)** — paste a page URL (`https://…`); the button switches
   to *Scrape & Index* and the page's readable text is saved to
   `data/notes/web_<title>_<timestamp>.txt` and indexed immediately
3. **Drop files** into:
   - `data/notes/` — manual notes
   - `data/repo_chunks/` — code snippets / repo exports
   - `data/wwdc/` — WWDC transcripts / docs
4. Run `./embed.sh` to index new files on disk

The Train tab lists every knowledge file with a preview pane, so you can
inspect exactly what was saved or scraped.

Supported extensions: `.txt`, `.md`, `.swift`, `.py`, `.json`, `.yaml`, `.yml`

## Cleanup

Stop services with **Ctrl+C** in the terminal running `./start.sh`.

To reset the vector database:

```bash
rm -rf chroma_db/
./embed.sh
```

To remove the Python venv:

```bash
rm -rf backend/.venv
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Embedding service unavailable` | Ensure Ollama is running: `ollama serve` |
| Empty answers / no sources | Train content first or run `./embed.sh` |
| Port 3000 in use | Change port in `frontend/vite.config.js` |
| Port 8000 in use | Edit `start.sh` uvicorn port |
| Voice models not ready | Run `./scripts/download_voice_models.sh` |
| Transcription failed (WebM) | Install ffmpeg: `brew install ffmpeg` |
| Microphone blocked | Allow mic for localhost in browser settings |
| Voice never auto-sends | Pause until bars drop below the dotted threshold line; it adapts to steady noise (fans) within a few seconds |
| URL scrape returns no text | Page is likely JavaScript-rendered; copy the text and paste it instead |
