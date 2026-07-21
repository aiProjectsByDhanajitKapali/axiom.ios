"""Ollama connectivity and model readiness checks."""

from __future__ import annotations

import os
from typing import Any

import httpx

def _normalize_host(raw: str) -> str:
    """Accept OLLAMA_HOST values like '0.0.0.0:11434' (no scheme, bind-all address)."""
    host = raw.strip().rstrip("/") or "http://127.0.0.1:11434"
    if "://" not in host:
        host = f"http://{host}"
    return host.replace("//0.0.0.0", "//127.0.0.1")


OLLAMA_HOST = _normalize_host(os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434"))
LLM_MODEL = os.getenv("AXIOM_LLM_MODEL", "qwen3:4b-instruct")
EMBED_MODEL = os.getenv("AXIOM_EMBED_MODEL", "nomic-embed-text")
CHECK_TIMEOUT = 4.0

_thinking_capable: bool | None = None


def llm_think_kwargs() -> dict[str, Any]:
    """`think=False` for hybrid-reasoning models; nothing for plain instruct models
    (which reject the parameter). Result is cached after the first check."""
    global _thinking_capable
    if _thinking_capable is None:
        try:
            import ollama

            _thinking_capable = "thinking" in (ollama.show(LLM_MODEL).capabilities or [])
        except Exception:
            return {}  # probe failed (e.g. model still pulling) — don't cache
    return {"think": False} if _thinking_capable else {}


def _matches_model(name: str, candidates: list[str]) -> bool:
    return any(c == name or c.startswith(f"{name}:") or c.split(":")[0] == name.split(":")[0] for c in candidates)


async def get_ollama_status() -> dict[str, Any]:
    ollama_state = {"ready": False, "host": OLLAMA_HOST, "error": None}
    llm_state = {
        "name": LLM_MODEL,
        "installed": False,
        "loaded": False,
        "ready": False,
    }
    embed_state = {
        "name": EMBED_MODEL,
        "installed": False,
        "loaded": False,
        "ready": False,
    }

    try:
        async with httpx.AsyncClient(timeout=CHECK_TIMEOUT) as client:
            tags_resp = await client.get(f"{OLLAMA_HOST}/api/tags")
            tags_resp.raise_for_status()
            ollama_state["ready"] = True

            installed = [m.get("name", "") for m in tags_resp.json().get("models", [])]
            llm_state["installed"] = _matches_model(LLM_MODEL, installed)
            embed_state["installed"] = _matches_model(EMBED_MODEL, installed)

            ps_resp = await client.get(f"{OLLAMA_HOST}/api/ps")
            ps_resp.raise_for_status()
            running = [m.get("name", "") for m in ps_resp.json().get("models", [])]
            llm_state["loaded"] = _matches_model(LLM_MODEL, running)
            embed_state["loaded"] = _matches_model(EMBED_MODEL, running)

    except Exception as exc:
        ollama_state["error"] = str(exc)

    # "Ready" means usable: installed models load on demand, so don't require
    # them to be resident in memory (Ollama unloads idle models after keep_alive).
    llm_state["ready"] = ollama_state["ready"] and llm_state["installed"]
    embed_state["ready"] = ollama_state["ready"] and embed_state["installed"]

    models_ready = llm_state["ready"] and embed_state["ready"]

    return {
        "ollama": ollama_state,
        "models": {
            "ready": models_ready,
            "llm": llm_state,
            "embed": embed_state,
        },
    }
