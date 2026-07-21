"""Text chunking, Ollama embeddings, and ChromaDB indexing."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import ollama

from ollama_status import EMBED_MODEL
from database import (
    delete_by_source,
    list_indexed_sources,
    prune_orphaned_sources,
    reset_collection,
    upsert_chunks,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIRS = [
    ROOT_DIR / "data" / "notes",
    ROOT_DIR / "data" / "repo_chunks",
    ROOT_DIR / "data" / "wwdc",
]

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120
SUPPORTED_EXTENSIONS = {".txt", ".md", ".swift", ".py", ".json", ".yaml", ".yml"}


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []

    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) + 2 <= chunk_size:
            current = f"{current}\n\n{para}".strip() if current else para
        else:
            if current:
                chunks.append(current)
            if len(para) <= chunk_size:
                current = para
            else:
                start = 0
                while start < len(para):
                    end = start + chunk_size
                    chunks.append(para[start:end])
                    start = end - overlap
                current = ""

    if current:
        chunks.append(current)

    # Merge tiny trailing fragments
    merged: list[str] = []
    for c in chunks:
        if merged and len(c) < 80:
            merged[-1] = f"{merged[-1]}\n\n{c}"
        else:
            merged.append(c)
    return merged


def embed_text(text: str) -> list[float]:
    response = ollama.embeddings(model=EMBED_MODEL, prompt=text, keep_alive="30m")
    return response["embedding"]


def _chunk_id(source: str, index: int, content: str) -> str:
    digest = hashlib.sha256(f"{source}:{index}:{content[:64]}".encode()).hexdigest()[:16]
    return f"{Path(source).stem}_{index}_{digest}"


def index_file(file_path: Path) -> int:
    """Index a single file; returns number of chunks stored."""
    file_path = file_path.resolve()
    if not file_path.is_file():
        return 0

    suffix = file_path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        return 0

    source = str(file_path.relative_to(ROOT_DIR))
    text = file_path.read_text(encoding="utf-8", errors="replace")
    chunks = chunk_text(text)

    # Always clear prior chunks for this source before writing (or leaving empty).
    delete_by_source(source)
    if not chunks:
        return 0

    ids: list[str] = []
    documents: list[str] = []
    embeddings: list[list[float]] = []
    metadatas: list[dict] = []

    for i, chunk in enumerate(chunks):
        ids.append(_chunk_id(source, i, chunk))
        documents.append(chunk)
        embeddings.append(embed_text(chunk))
        metadatas.append({"source": source, "chunk_index": i})

    upsert_chunks(ids, documents, embeddings, metadatas)
    return len(chunks)


def _discover_files(dirs: list[Path]) -> list[Path]:
    files: list[Path] = []
    for data_dir in dirs:
        if not data_dir.exists():
            continue
        for file_path in sorted(data_dir.rglob("*")):
            if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_EXTENSIONS:
                files.append(file_path)
    return files


def index_directory(directory: Path | None = None, *, full_refresh: bool = False) -> dict[str, int]:
    """Re-index supported files under data directories.

    When ``full_refresh`` is True (used by ``embed.sh``), the ChromaDB collection
    is dropped and rebuilt so no stale chunks remain from deleted or renamed files.
    """
    stats: dict[str, int] = {}
    dirs = [directory] if directory else DATA_DIRS

    if full_refresh and directory is None:
        reset_collection()

    indexed_sources: set[str] = set()
    for file_path in _discover_files(dirs):
        count = index_file(file_path)
        rel = str(file_path.relative_to(ROOT_DIR))
        indexed_sources.add(rel)
        if count:
            stats[rel] = count

    if not full_refresh:
        if directory is None:
            prune_orphaned_sources(indexed_sources)
        else:
            prefix = f"{directory.resolve().relative_to(ROOT_DIR)}/"
            stale = {s for s in list_indexed_sources() if s.startswith(prefix)} - indexed_sources
            for source in stale:
                delete_by_source(source)

    return stats


def index_notes_only() -> dict[str, int]:
    return index_directory(ROOT_DIR / "data" / "notes")


if __name__ == "__main__":
    print("Clearing existing ChromaDB collection and re-indexing all data…")
    results = index_directory(full_refresh=True)
    total = sum(results.values())
    print(f"Indexed {len(results)} files, {total} chunks total.")
    for path, count in results.items():
        print(f"  {path}: {count} chunks")
