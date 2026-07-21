"""Strip markdown and code so TTS sounds natural."""

from __future__ import annotations

import re

_CODE_FENCE = re.compile(r"```[\s\S]*?```", re.MULTILINE)
_INLINE_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_HEADING = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_BOLD_ITALIC = re.compile(r"\*+([^*]+)\*+")
_MAX_CHARS = 4000


def prepare_text_for_speech(text: str, max_chars: int = _MAX_CHARS) -> str:
    if not text or not text.strip():
        return ""

    out = text.strip()
    out = _CODE_FENCE.sub(" Code snippet omitted. ", out)
    out = _INLINE_CODE.sub(r"\1", out)
    out = _LINK.sub(r"\1", out)
    out = _HEADING.sub("", out)
    out = _BOLD_ITALIC.sub(r"\1", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    out = re.sub(r"\s+", " ", out).strip()

    if len(out) > max_chars:
        cut = out[:max_chars]
        last_period = cut.rfind(". ")
        if last_period > max_chars // 2:
            cut = cut[: last_period + 1]
        out = cut.strip() + " Answer truncated for speech."

    return out
