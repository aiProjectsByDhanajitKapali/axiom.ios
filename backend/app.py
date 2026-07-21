"""FastAPI application: Ask, Train, and Voice endpoints."""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
import ollama
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from database import query_similar
from indexer import SUPPORTED_EXTENSIONS, embed_text, index_file
from ollama_status import EMBED_MODEL, LLM_MODEL, get_ollama_status, llm_think_kwargs
from voice import (
    get_stt_status,
    get_tts_status,
    prepare_text_for_speech,
    synthesize_speech,
    transcribe_audio,
)
from friday import friday_ask, get_greeting

ROOT_DIR = Path(__file__).resolve().parent.parent
NOTES_DIR = ROOT_DIR / "data" / "notes"
TOP_K = 5
# Disable qwen3's hidden <think> reasoning (the bulk of response latency) and
# keep models resident between requests instead of reloading after 5 idle minutes.
LLM_OPTIONS = {"temperature": 0.0}
LLM_KEEP_ALIVE = "30m"
VOICE_ENABLED = os.environ.get("AXIOM_VOICE_ENABLED", "true").lower() in ("1", "true", "yes")
MAX_AUDIO_BYTES = 10 * 1024 * 1024

SYSTEM_PROMPT = """You are Axiom, a local knowledge assistant for iOS development.
Answer ONLY using the retrieved context below. If the context does not contain enough information, say so clearly.
Cite sources by referring to the [Source N] labels. Do not invent facts.
Keep answers concise and technical."""

VOICE_SYSTEM_SUFFIX = """
The user is listening via text-to-speech. Reply in plain spoken English only:
- No markdown, code fences, bullet lists, or URLs.
- Two to four short sentences maximum.
- Still ground every claim in the provided context."""

app = FastAPI(title="Axiom.ios RAG API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    voice: bool = False


class AskResponse(BaseModel):
    answer: str
    sources: list[dict]


class TrainRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=100_000)


class TrainResponse(BaseModel):
    filename: str
    chunks_indexed: int
    message: str


class TrainUrlRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2000)


class TrainFileInfo(BaseModel):
    name: str
    size: int
    modified: str


class TrainFileContent(BaseModel):
    name: str
    content: str
    truncated: bool


class TranscribeResponse(BaseModel):
    text: str
    is_speech: bool


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


class FridayAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    voice: bool = True


class FridayAskResponse(BaseModel):
    answer: str
    spoken_text: str
    open_world_monitor: bool = False
    monitor_line: Optional[str] = None


class FridayGreetingResponse(BaseModel):
    greeting: str


def _retrieve(question: str) -> tuple[list[dict], list[dict]]:
    """Embed the question and fetch top-K chunks. Returns (messages-context, sources)."""
    try:
        query_embedding = embed_text(question)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Embedding service unavailable: {exc}") from exc

    results = query_similar(query_embedding, n_results=TOP_K)
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    context_blocks: list[str] = []
    sources: list[dict] = []
    for i, (doc, meta, dist) in enumerate(zip(documents, metadatas, distances), start=1):
        source = meta.get("source", "unknown") if meta else "unknown"
        context_blocks.append(f"[Source {i}] ({source})\n{doc}")
        sources.append({"label": f"Source {i}", "path": source, "distance": round(dist, 4)})

    return context_blocks, sources


def _build_messages(question: str, context_blocks: list[str], *, voice: bool) -> list[dict]:
    context = "\n\n---\n\n".join(context_blocks)
    user_prompt = f"""Context:
{context}

Question: {question}

Answer based only on the context above."""
    system = SYSTEM_PROMPT + (VOICE_SYSTEM_SUFFIX if voice else "")
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_prompt},
    ]


EMPTY_INDEX_MESSAGE = "No knowledge has been indexed yet. Use the Train tab to add notes, or run ./embed.sh."


def _run_rag(question: str, *, voice: bool = False) -> AskResponse:
    context_blocks, sources = _retrieve(question)
    if not context_blocks:
        return AskResponse(answer=EMPTY_INDEX_MESSAGE, sources=[])

    try:
        response = ollama.chat(
            model=LLM_MODEL,
            messages=_build_messages(question, context_blocks, voice=voice),
            options=LLM_OPTIONS,
            keep_alive=LLM_KEEP_ALIVE,
            **llm_think_kwargs(),
        )
        answer = response["message"]["content"].strip()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"LLM service unavailable: {exc}") from exc

    return AskResponse(answer=answer, sources=sources)


@app.get("/api/health")
async def health():
    return {"status": "ok", "llm": LLM_MODEL, "embed": EMBED_MODEL}


@app.get("/api/status")
async def status():
    """Ollama server + model load state for the frontend status indicator."""
    payload = await get_ollama_status()
    return {"status": "ok", **payload}


@app.post("/api/ask", response_model=AskResponse)
def ask(body: AskRequest):
    # Sync handler on purpose: FastAPI runs it in the threadpool so the long
    # LLM call doesn't block the event loop (and /api/status polls).
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    return _run_rag(question, voice=body.voice)


@app.post("/api/ask/stream")
async def ask_stream(body: AskRequest):
    """NDJSON stream: a 'sources' event, then 'delta' events per token, then 'done'."""
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    context_blocks, sources = await run_in_threadpool(_retrieve, question)

    async def generate():
        yield json.dumps({"type": "sources", "sources": sources}) + "\n"
        if not context_blocks:
            yield json.dumps({"type": "delta", "text": EMPTY_INDEX_MESSAGE}) + "\n"
            yield json.dumps({"type": "done"}) + "\n"
            return
        try:
            stream = await ollama.AsyncClient().chat(
                model=LLM_MODEL,
                messages=_build_messages(question, context_blocks, voice=body.voice),
                options=LLM_OPTIONS,
                keep_alive=LLM_KEEP_ALIVE,
                stream=True,
                **llm_think_kwargs(),
            )
            async for chunk in stream:
                piece = chunk.message.content or ""
                if piece:
                    yield json.dumps({"type": "delta", "text": piece}) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "detail": f"LLM service unavailable: {exc}"}) + "\n"
            return
        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.get("/api/voice/status")
async def voice_status():
    if not VOICE_ENABLED:
        return {"enabled": False, "stt": {"ready": False}, "tts": {"ready": False}}
    return {
        "enabled": True,
        "stt": get_stt_status(),
        "tts": get_tts_status(),
    }


@app.post("/api/voice/transcribe", response_model=TranscribeResponse)
async def voice_transcribe(audio: UploadFile = File(...)):
    if not VOICE_ENABLED:
        raise HTTPException(status_code=503, detail="Voice features are disabled")

    stt = get_stt_status()
    if not stt["ready"]:
        raise HTTPException(
            status_code=503,
            detail=stt.get("error") or "Speech-to-text is not ready",
        )

    raw = await audio.read()
    if not raw:
        return TranscribeResponse(text="", is_speech=False)
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip too large (max 10 MB)")

    suffix = Path(audio.filename or "clip.webm").suffix or ".webm"
    try:
        text = transcribe_audio(raw, suffix=suffix)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Transcription failed: {exc}") from exc

    return TranscribeResponse(text=text, is_speech=bool(text.strip()))


@app.post("/api/voice/speak")
async def voice_speak(body: SpeakRequest):
    if not VOICE_ENABLED:
        raise HTTPException(status_code=503, detail="Voice features are disabled")

    tts = get_tts_status()
    if not tts["ready"]:
        raise HTTPException(
            status_code=503,
            detail=tts.get("error") or "Text-to-speech is not ready",
        )

    spoken = prepare_text_for_speech(body.text)
    if not spoken:
        raise HTTPException(status_code=400, detail="No speakable text after processing")

    try:
        wav = synthesize_speech(spoken)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Speech synthesis failed: {exc}") from exc

    return Response(content=wav, media_type="audio/wav")


@app.get("/api/friday/greeting", response_model=FridayGreetingResponse)
async def friday_greeting():
    return FridayGreetingResponse(greeting=get_greeting())


@app.post("/api/friday/ask", response_model=FridayAskResponse)
async def friday_ask_endpoint(body: FridayAskRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    try:
        result = await friday_ask(question, voice=body.voice)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Friday assistant unavailable: {exc}") from exc
    return FridayAskResponse(**result)


def _save_and_index(filename: str, content: str) -> TrainResponse:
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    file_path = NOTES_DIR / filename
    file_path.write_text(content, encoding="utf-8")

    try:
        chunks = index_file(file_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc

    return TrainResponse(
        filename=filename,
        chunks_indexed=chunks,
        message=f"Saved and indexed {chunks} chunk(s) into the knowledge base.",
    )


@app.post("/api/train", response_model=TrainResponse)
def train(body: TrainRequest):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    return _save_and_index(f"note_{int(time.time())}.txt", content)


def _scrape_page(url: str) -> tuple[str, str]:
    """Fetch a web page and return (title, readable text)."""
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="beautifulsoup4 is not installed — run: pip install -r backend/requirements.txt",
        ) from exc

    try:
        resp = httpx.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Axiom.ios local knowledge base)"},
            follow_redirects=True,
            timeout=20.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch the page: {exc}") from exc

    content_type = resp.headers.get("content-type", "")
    if "html" not in content_type and "text" not in content_type:
        raise HTTPException(status_code=415, detail=f"Not a text page (content-type: {content_type})")

    soup = BeautifulSoup(resp.text, "html.parser")
    title = (soup.title.string or "").strip() if soup.title else ""

    for tag in soup(["script", "style", "noscript", "iframe", "svg", "header", "footer", "nav"]):
        tag.decompose()

    text = soup.get_text("\n")
    # collapse runs of blank lines and per-line whitespace
    lines = [line.strip() for line in text.splitlines()]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()

    if len(text) < 80:
        raise HTTPException(
            status_code=422,
            detail="Could not extract meaningful text from that page (it may be JavaScript-rendered).",
        )

    return title, text[:100_000]


@app.post("/api/train/url", response_model=TrainResponse)
def train_url(body: TrainUrlRequest):
    url = body.url.strip()
    if not re.match(r"^https?://", url, re.IGNORECASE):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    title, text = _scrape_page(url)

    slug = re.sub(r"[^a-z0-9]+", "-", (title or url.split("//", 1)[1]).lower()).strip("-")[:48]
    filename = f"web_{slug or 'page'}_{int(time.time())}.txt"

    header = f"Source: {url}\nTitle: {title or '(untitled)'}\nSaved: {datetime.now().isoformat(timespec='seconds')}\n\n"
    return _save_and_index(filename, header + text)


@app.get("/api/train/files")
def train_files():
    files = []
    if NOTES_DIR.is_dir():
        for path in NOTES_DIR.iterdir():
            if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue
            stat = path.stat()
            files.append(
                TrainFileInfo(
                    name=path.name,
                    size=stat.st_size,
                    modified=datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
                )
            )
    files.sort(key=lambda f: f.modified, reverse=True)
    return {"files": files}


PREVIEW_MAX_CHARS = 50_000


@app.get("/api/train/files/{name}", response_model=TrainFileContent)
def train_file_content(name: str):
    if "/" in name or "\\" in name or name.startswith(".") or Path(name).suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid file name")
    path = NOTES_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    content = path.read_text(encoding="utf-8", errors="replace")
    truncated = len(content) > PREVIEW_MAX_CHARS
    return TrainFileContent(name=name, content=content[:PREVIEW_MAX_CHARS], truncated=truncated)
