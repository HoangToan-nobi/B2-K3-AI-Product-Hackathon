from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str


class WebSearchService:
    async def search(self, query: str, limit: int = 3) -> list[SearchResult]:
        if not query.strip():
            return []
        params = {
            "q": query[:300],
            "format": "json",
            "no_redirect": "1",
            "no_html": "1",
            "skip_disambig": "1",
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get("https://api.duckduckgo.com/", params=params)
                response.raise_for_status()
                body: dict[str, Any] = response.json()
        except Exception:
            return []

        results: list[SearchResult] = []
        abstract = body.get("AbstractText")
        abstract_url = body.get("AbstractURL")
        heading = body.get("Heading")
        if abstract and abstract_url:
            results.append(SearchResult(title=heading or "DuckDuckGo", url=abstract_url, snippet=abstract))

        def collect(items: list[dict[str, Any]]) -> None:
            for item in items:
                if len(results) >= limit:
                    return
                if "Topics" in item and isinstance(item["Topics"], list):
                    collect(item["Topics"])
                    continue
                text = item.get("Text")
                url = item.get("FirstURL")
                if text and url:
                    title = text.split(" - ", 1)[0][:120]
                    results.append(SearchResult(title=title, url=url, snippet=text))

        related = body.get("RelatedTopics")
        if isinstance(related, list):
            collect(related)
        return results[:limit]
