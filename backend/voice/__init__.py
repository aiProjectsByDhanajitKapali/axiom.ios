"""Local voice I/O: Whisper STT and Piper TTS."""

from voice.stt import get_stt_status, transcribe_audio
from voice.tts import get_tts_status, synthesize_speech
from voice.text_for_speech import prepare_text_for_speech

__all__ = [
    "get_stt_status",
    "get_tts_status",
    "transcribe_audio",
    "synthesize_speech",
    "prepare_text_for_speech",
]
