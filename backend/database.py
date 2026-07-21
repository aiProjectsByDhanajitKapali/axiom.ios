"""ChromaDB persistent client and collection helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings

ROOT_DIR = Path(__file__).resolve().parent.parent
CHROMA_PATH = ROOT_DIR / "chroma_db"
COLLECTION_NAME = "axiom_knowledge"

_client: Optional[chromadb.PersistentClient] = None


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=str(CHROMA_PATH),
            settings=Settings(anonymized_telemetry=False),
        )
    return _client


def get_collection():
    client = get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def upsert_chunks(
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict],
) -> None:
    collection = get_collection()
    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )


def query_similar(embedding: list[float], n_results: int = 5) -> dict:
    collection = get_collection()
    return collection.query(
        query_embeddings=[embedding],
        n_results=n_results,
        include=["documents", "metadatas", "distances"],
    )


def delete_by_source(source: str) -> None:
    """Remove all chunks belonging to a given source file."""
    collection = get_collection()
    existing = collection.get(where={"source": source})
    if existing["ids"]:
        collection.delete(ids=existing["ids"])


def reset_collection() -> None:
    """Drop and recreate the vector collection (safe full re-index)."""
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        # Collection may not exist on first run
        pass
    get_collection()


def list_indexed_sources() -> set[str]:
    """Return all source paths currently stored in ChromaDB."""
    collection = get_collection()
    result = collection.get(include=["metadatas"])
    sources: set[str] = set()
    for meta in result.get("metadatas") or []:
        if meta and meta.get("source"):
            sources.add(meta["source"])
    return sources


def prune_orphaned_sources(valid_sources: set[str]) -> int:
    """Remove chunks whose source file is no longer in the valid set."""
    removed = 0
    for source in list_indexed_sources() - valid_sources:
        before = get_collection().get(where={"source": source})
        delete_by_source(source)
        removed += len(before.get("ids") or [])
    return removed
