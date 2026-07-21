"""Text-to-speech via Piper (English, local)."""

from __future__ import annotations

import io
import os
import wave
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = ROOT_DIR / "models" / "piper"
PIPER_VOICE = os.environ.get(
    "AXIOM_PIPER_VOICE",
    str(MODELS_DIR / "en_US-lessac-medium.onnx"),
)

_piper_voice: Any = None
_piper_error: str | None = None


def _voice_path() -> Path:
    return Path(PIPER_VOICE)


def _load_piper() -> Any:
    global _piper_voice, _piper_error
    if _piper_voice is not None:
        return _piper_voice
    if _piper_error is not None:
        raise RuntimeError(_piper_error)

    voice_path = _voice_path()
    if not voice_path.is_file():
        _piper_error = (
            f"Piper voice not found at {voice_path}. "
            "Run ./scripts/download_voice_models.sh from the project root."
        )
        raise RuntimeError(_piper_error)

    try:
        from piper import PiperVoice
    except ImportError as exc:
        _piper_error = f"piper-tts not installed: {exc}"
        raise RuntimeError(_piper_error) from exc

    try:
        _piper_voice = PiperVoice.load(str(voice_path))
        return _piper_voice
    except Exception as exc:
        _piper_error = str(exc)
        raise RuntimeError(_piper_error) from exc


def get_tts_status(*, probe_load: bool = False) -> dict:
    """Lightweight readiness check; avoid loading Piper unless probe_load=True."""
    voice_path = _voice_path()
    if not voice_path.is_file():
        return {
            "ready": False,
            "voice": str(voice_path),
            "error": "Piper voice model missing. Run ./scripts/download_voice_models.sh",
        }
    if _piper_voice is not None:
        return {"ready": True, "voice": voice_path.name, "error": None}
    if _piper_error:
        return {"ready": False, "voice": str(voice_path), "error": _piper_error}
    try:
        from piper import PiperVoice  # noqa: F401
    except ImportError as exc:
        return {
            "ready": False,
            "voice": str(voice_path),
            "error": f"piper-tts not installed: {exc}",
        }

    if probe_load:
        try:
            _load_piper()
            return {"ready": True, "voice": voice_path.name, "error": None}
        except RuntimeError as exc:
            return {"ready": False, "voice": str(voice_path), "error": str(exc)}

    return {"ready": True, "voice": voice_path.name, "error": None}


def synthesize_speech(text: str) -> bytes:
    if not text.strip():
        raise ValueError("Text cannot be empty")

    voice = _load_piper()
    buffer = io.BytesIO()

    with wave.open(buffer, "wb") as wav_file:
        if hasattr(voice, "synthesize_wav"):
            voice.synthesize_wav(text, wav_file)
        else:
            sample_rate = voice.config.sample_rate
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for chunk in voice.synthesize(text):
                frames = getattr(chunk, "audio_int16_bytes", None) or chunk
                wav_file.writeframes(frames)

    return buffer.getvalue()
