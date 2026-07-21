"""Friday persona prompts, intent detection, and ask orchestration."""

from __future__ import annotations

import re
from datetime import datetime

import ollama

from friday.news import fetch_world_news_briefing
from ollama_status import LLM_MODEL, llm_think_kwargs

FRIDAY_VOICE_SUFFIX = """
The user is listening via text-to-speech. Reply in plain spoken English only:
- No markdown, code fences, bullet lists, or URLs.
- Three to five short sentences maximum.
- Use a calm, composed tone. Address the user as "boss" naturally."""

FRIDAY_BASE_PROMPT = """You are F.R.I.D.A.Y. — Fully Responsive Intelligent Digital Assistant for You.
You are Tony Stark's AI: calm, composed, precise, and occasionally dry. You brief, inform, and move on.
Speak like a trusted aide who has been awake while the boss slept. Use contractions and natural speech."""

FRIDAY_NEWS_PROMPT = FRIDAY_BASE_PROMPT + """
You will receive a live global news briefing. Summarize the biggest stories in 3–5 short spoken sentences.
Hit only the most significant headlines. Do not invent stories not present in the briefing.
Do not mention tools, monitors, or opening anything — that is handled separately."""

FRIDAY_GENERAL_PROMPT = FRIDAY_BASE_PROMPT + """
You are in voice mode. Keep replies to two or three short sentences.
If asked about world news or current events, tell the user to ask for a world update or news brief."""

MONITOR_LINE = (
    "Let me open up the world monitor so you can better visualize what's happening."
)

_NEWS_PATTERNS = (
    r"\bworld\b",
    r"\bnews\b",
    r"\bheadlines\b",
    r"\bbrief me\b",
    r"\bcatch me up\b",
    r"\bwhat did i miss\b",
    r"\bcurrent events\b",
    r"\bgoing on\b",
    r"\bhappening\b",
    r"\bglobal update\b",
    r"\bworld update\b",
    r"\bany news\b",
    r"\bwhat'?s new\b",
)


def get_greeting() -> str:
    hour = datetime.now().hour
    if hour >= 22 or hour < 4:
        return "Greetings boss, you're up late at night today. What are you up to?"
    if hour < 12:
        return "Good morning, boss. Early start today — what are we working on?"
    if hour < 17:
        return "Good afternoon, boss. What do you need?"
    return "Good evening, boss. What are you up to tonight?"


def is_news_intent(question: str) -> bool:
    text = question.lower().strip()
    return any(re.search(pattern, text) for pattern in _NEWS_PATTERNS)


def _chat(system: str, user: str, *, voice: bool) -> str:
    prompt = system + (FRIDAY_VOICE_SUFFIX if voice else "")
    response = ollama.chat(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": user},
        ],
        options={"temperature": 0.0},
        keep_alive="30m",
        **llm_think_kwargs(),
    )
    return response["message"]["content"].strip()


async def friday_ask(question: str, *, voice: bool = False) -> dict:
    """
    Route Friday-mode questions. Returns answer text and optional world-monitor action.
    """
    if is_news_intent(question):
        briefing = await fetch_world_news_briefing()
        if not briefing:
            answer = (
                "News feed's unresponsive right now, boss. Want me to try again?"
                if voice
                else "The global news feeds are unresponsive right now. Please try again in a moment."
            )
            return {"answer": answer, "open_world_monitor": False, "spoken_text": answer}

        user_prompt = f"""News briefing:
{briefing}

User request: {question}

Give a spoken global news brief based only on the briefing above."""

        answer = _chat(FRIDAY_NEWS_PROMPT, user_prompt, voice=voice)
        spoken = f"{answer} {MONITOR_LINE}" if voice else answer
        return {
            "answer": answer,
            "open_world_monitor": True,
            "monitor_line": MONITOR_LINE,
            "spoken_text": spoken,
        }

    user_prompt = f"User said: {question}\n\nRespond in character."
    answer = _chat(FRIDAY_GENERAL_PROMPT, user_prompt, voice=voice)
    return {"answer": answer, "open_world_monitor": False, "spoken_text": answer}
