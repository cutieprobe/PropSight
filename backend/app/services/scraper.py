"""
Fetch listing descriptions from PropertyGuru detail pages.

Server-side fetching avoids browser CORS/CSP/iframe restrictions.
We extract the og:description meta tag, which contains the agent's
actual listing description (rental terms, cooking policy, etc.).
"""

import asyncio
import logging
import re
from html.parser import HTMLParser

import httpx

logger = logging.getLogger(__name__)

# Reusable async client
_client: httpx.AsyncClient | None = None

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

FETCH_TIMEOUT = 8
MAX_CONCURRENT = 10


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=FETCH_TIMEOUT,
        )
    return _client


async def close_client() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


class OGDescriptionParser(HTMLParser):
    """Fast HTML parser that extracts og:description and stops early."""

    def __init__(self):
        super().__init__()
        self.og_description: str = ""
        self.meta_description: str = ""
        self.title: str = ""
        self._in_title = False
        self._title_data: list[str] = []
        self._found_og = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if self._found_og:
            return

        if tag == "title":
            self._in_title = True
            return

        if tag != "meta":
            return

        attr_dict = {k.lower(): v for k, v in attrs if v is not None}
        prop = attr_dict.get("property", "")
        name = attr_dict.get("name", "")
        content = attr_dict.get("content", "")

        if prop == "og:description" and content:
            self.og_description = content
            self._found_og = True
        elif name == "description" and content and not self.meta_description:
            self.meta_description = content

    def handle_data(self, data: str):
        if self._in_title:
            self._title_data.append(data)

    def handle_endtag(self, tag: str):
        if tag == "title" and self._in_title:
            self._in_title = False
            self.title = "".join(self._title_data).strip()


def _extract_next_data_description(html: str) -> str:
    """Try to extract description from __NEXT_DATA__ JSON in the HTML."""
    import json

    match = re.search(
        r'<script\s+id="__NEXT_DATA__"\s+type="application/json">(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not match:
        return ""

    try:
        data = json.loads(match.group(1))
        page_props = data.get("props", {}).get("pageProps", {})
        og_desc = (
            page_props.get("data", {})
            .get("metadata", {})
            .get("metaTags", {})
            .get("openGraph", {})
            .get("description", "")
        )
        if og_desc and len(og_desc) > 30:
            return og_desc
    except (json.JSONDecodeError, AttributeError):
        pass

    return ""


def _clean_html(text: str) -> str:
    """Strip HTML tags and normalize whitespace."""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def fetch_listing_description(url: str, cookies: str = "") -> str:
    """
    Fetch a PropertyGuru listing page and extract the agent's description.

    Priority:
    1. __NEXT_DATA__ → pageProps.data.metadata.metaTags.openGraph.description
    2. <meta property="og:description"> tag
    3. <meta name="description"> tag
    """
    try:
        client = get_client()
        headers = {}
        if cookies:
            headers["Cookie"] = cookies
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        html = resp.text

        # Strategy 1: __NEXT_DATA__ JSON (most reliable, full data)
        next_desc = _extract_next_data_description(html)
        if next_desc:
            clean = _clean_html(next_desc)
            logger.info(
                "Fetched description via __NEXT_DATA__ for %s: %d chars",
                url, len(clean),
            )
            return clean[:3000]

        # Strategy 2: HTML meta tags
        parser = OGDescriptionParser()
        # Only parse first 50KB (meta tags are in <head>)
        parser.feed(html[:50000])

        desc = parser.og_description or parser.meta_description
        if desc and len(desc) > 30:
            clean = _clean_html(desc)
            title = parser.title
            combined = f"{title}\n\n{clean}" if title else clean
            logger.info(
                "Fetched description via meta tag for %s: %d chars",
                url, len(clean),
            )
            return combined[:3000]

        logger.warning("No description found for %s", url)
        return ""

    except Exception as e:
        logger.warning("Failed to fetch %s: %s", url, e)
        return ""


async def fetch_descriptions_batch(
    urls: dict[str, str],
    cookies: str = "",
) -> dict[str, str]:
    """
    Fetch descriptions for multiple listings concurrently.

    Args:
        urls: mapping of listing_id → listing_url
        cookies: browser cookie string for authentication

    Returns:
        mapping of listing_id → description text
    """
    sem = asyncio.Semaphore(MAX_CONCURRENT)

    async def _fetch(lid: str, url: str) -> tuple[str, str]:
        async with sem:
            desc = await fetch_listing_description(url, cookies=cookies)
            return lid, desc

    tasks = [_fetch(lid, url) for lid, url in urls.items()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    out: dict[str, str] = {}
    for result in results:
        if isinstance(result, Exception):
            logger.error("Batch fetch error: %s", result)
            continue
        lid, desc = result
        out[lid] = desc

    return out
