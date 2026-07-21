"""Live global news RSS aggregation for Friday briefings."""

from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET

import httpx

SEED_FEEDS = [
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.cnbc.com/id/100727362/device/rss/rss.html",
    "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
    "https://www.aljazeera.com/xml/rss/all.xml",
]

_MAX_ITEMS_PER_FEED = 5
_MAX_BRIEFING_ITEMS = 12


def _source_name(url: str) -> str:
    host = url.split("/")[2] if "//" in url else url
    label = host.split(".")[1] if "." in host else host
    return label.upper()


async def _fetch_and_parse_feed(client: httpx.AsyncClient, url: str) -> list[dict]:
    try:
        response = await client.get(url, headers={"User-Agent": "Axiom-Friday/1.0"}, timeout=8.0)
        if response.status_code != 200:
            return []

        root = ET.fromstring(response.content)
        source = _source_name(url)
        items: list[dict] = []

        for item in root.findall(".//item")[:_MAX_ITEMS_PER_FEED]:
            title = (item.findtext("title") or "").strip()
            description = (item.findtext("description") or "").strip()
            link = (item.findtext("link") or "").strip()
            if description:
                description = re.sub(r"<[^<]+?>", "", description).strip()
            if not title:
                continue
            items.append(
                {
                    "source": source,
                    "title": title,
                    "summary": (description[:200] + "...") if len(description) > 200 else description,
                    "link": link,
                }
            )
        return items
    except Exception:
        return []


async def fetch_world_news_briefing() -> str:
    """Fetch headlines from major outlets and return a text briefing for the LLM."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=12) as client:
        tasks = [_fetch_and_parse_feed(client, url) for url in SEED_FEEDS]
        results = await asyncio.gather(*tasks)

    articles = [item for batch in results for item in batch]
    if not articles:
        return ""

    lines = ["GLOBAL NEWS BRIEFING (LIVE)", ""]
    for entry in articles[:_MAX_BRIEFING_ITEMS]:
        lines.append(f"[{entry['source']}] {entry['title']}")
        if entry["summary"]:
            lines.append(entry["summary"])
        if entry["link"]:
            lines.append(f"Link: {entry['link']}")
        lines.append("")

    return "\n".join(lines)
