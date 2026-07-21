"""Speech-to-text via faster-whisper (English, local)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = ROOT_DIR / "models"
WHISPER_MODEL = os.environ.get("AXIOM_WHISPER_MODEL", "small.en")
WHISPER_DEVICE = os.environ.get("AXIOM_WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.environ.get("AXIOM_WHISPER_COMPUTE", "int8")

_whisper: Any = None
_whisper_error: str | None = None


def _model_cache_dir() -> Path:
    cache = MODELS_DIR / "whisper"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def _load_whisper() -> Any:
    global _whisper, _whisper_error
    if _whisper is not None:
        return _whisper
    if _whisper_error is not None:
        raise RuntimeError(_whisper_error)

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        _whisper_error = f"faster-whisper not installed: {exc}"
        raise RuntimeError(_whisper_error) from exc

    try:
        _whisper = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
            download_root=str(_model_cache_dir()),
        )
        return _whisper
    except Exception as exc:
        _whisper_error = str(exc)
        raise RuntimeError(_whisper_error) from exc


def get_stt_status(*, probe_load: bool = False) -> dict:
    """Lightweight readiness check; avoid loading Whisper unless probe_load=True."""
    if _whisper is not None:
        return {"ready": True, "model": WHISPER_MODEL, "error": None}
    if _whisper_error:
        return {
            "ready": False,
            "model": WHISPER_MODEL,
            "error": _whisper_error,
        }
    try:
        import faster_whisper  # noqa: F401
    except ImportError as exc:
        return {
            "ready": False,
            "model": WHISPER_MODEL,
            "error": f"faster-whisper not installed: {exc}",
        }

    if probe_load:
        try:
            _load_whisper()
            return {"ready": True, "model": WHISPER_MODEL, "error": None}
        except RuntimeError as exc:
            return {"ready": False, "model": WHISPER_MODEL, "error": str(exc)}

    return {
        "ready": True,
        "model": WHISPER_MODEL,
        "error": None,
        "note": "Whisper loads on first transcription",
    }


def transcribe_audio(audio_bytes: bytes, suffix: str = ".webm") -> str:
    if not audio_bytes:
        return ""

    model = _load_whisper()
    suffix = suffix if suffix.startswith(".") else f".{suffix}"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, _info = model.transcribe(
            tmp_path,
            language="en",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        parts = [seg.text.strip() for seg in segments if seg.text.strip()]
        return " ".join(parts).strip()
    finally:
        Path(tmp_path).unlink(missing_ok=True)
