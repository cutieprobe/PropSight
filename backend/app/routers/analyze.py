import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import AnalyzeRequest, AnalyzeResponse, ListingResult, ListingTags
from app.services.gemini import extract_tags, extract_tags_batch
from app.services.scraper import fetch_descriptions_batch

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_BATCH_SIZE = 20


# ── Analyze (stateless — LLM only, no caching) ──────────────────────────────


BATCH_CHUNK_SIZE = 5


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_listings(request: AnalyzeRequest):
    """
    Analyze listing descriptions via OpenAI.
    Uses batch extraction (multiple listings per API call) for speed.
    """
    if not request.listings:
        return AnalyzeResponse(results=[])

    if len(request.listings) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_BATCH_SIZE} listings per batch",
        )

    logger.info("Analyzing %d listings", len(request.listings))

    if len(request.listings) == 1:
        tags = await extract_tags(request.listings[0].text)
        return AnalyzeResponse(
            results=[ListingResult(id=request.listings[0].id, tags=tags, cached=False)]
        )

    all_pairs = [(l.id, l.text) for l in request.listings]
    chunks = [
        all_pairs[i : i + BATCH_CHUNK_SIZE]
        for i in range(0, len(all_pairs), BATCH_CHUNK_SIZE)
    ]

    chunk_tasks = [extract_tags_batch(chunk) for chunk in chunks]
    chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)

    tag_map: dict[str, ListingTags] = {}
    for cr in chunk_results:
        if isinstance(cr, Exception):
            logger.error("Batch extraction chunk failed: %s", cr)
            continue
        tag_map.update(cr)

    results: list[ListingResult] = []
    for listing in request.listings:
        tags = tag_map.get(listing.id, ListingTags())
        results.append(ListingResult(id=listing.id, tags=tags, cached=False))

    logger.info("Analyzed %d listings, %d with tags", len(results), len(tag_map))
    return AnalyzeResponse(results=results)


# ── Fetch descriptions (server-side) ────────────────────────────────────────


class FetchDescRequest(BaseModel):
    """Map of listing_id → listing_url."""
    urls: dict[str, str]


class FetchDescResponse(BaseModel):
    """Map of listing_id → description text."""
    descriptions: dict[str, str]


@router.post("/fetch-descriptions", response_model=FetchDescResponse)
async def fetch_descriptions(request: FetchDescRequest):
    """
    Server-side fetch of PropertyGuru listing pages.
    Extracts og:description (agent's listing text) from each page.
    """
    if not request.urls:
        return FetchDescResponse(descriptions={})

    logger.info("Fetching %d listing descriptions server-side", len(request.urls))
    descriptions = await fetch_descriptions_batch(request.urls)

    logger.info(
        "Descriptions: %d fetched, %d extracted",
        len(request.urls), len(descriptions),
    )
    return FetchDescResponse(descriptions=descriptions)


class AnalyzeUrlsRequest(BaseModel):
    urls: dict[str, str]
    cookies: str = ""


@router.post("/analyze-urls", response_model=AnalyzeResponse)
async def analyze_urls(request: AnalyzeUrlsRequest):
    """
    All-in-one: fetch listing pages server-side (with browser cookies),
    extract descriptions, then analyze with LLM.
    """
    if not request.urls:
        return AnalyzeResponse(results=[])

    if len(request.urls) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_BATCH_SIZE} listings per batch",
        )

    logger.info("Analyze-URLs: fetching %d listings", len(request.urls))
    descriptions = await fetch_descriptions_batch(
        request.urls, cookies=request.cookies
    )
    logger.info("Analyze-URLs: got %d descriptions", len(descriptions))

    tasks = []
    listing_ids = []
    for lid, desc in descriptions.items():
        if desc and len(desc.strip()) >= 30:
            tasks.append(extract_tags(desc))
            listing_ids.append(lid)

    tag_results = await asyncio.gather(*tasks, return_exceptions=True)

    results: list[ListingResult] = []
    for lid, tags_or_err in zip(listing_ids, tag_results):
        if isinstance(tags_or_err, Exception):
            logger.error("Failed listing %s: %s", lid, tags_or_err)
            tags = ListingTags()
        else:
            tags = tags_or_err
        results.append(ListingResult(id=lid, tags=tags, cached=False))

    for lid in request.urls:
        if lid not in listing_ids:
            results.append(ListingResult(id=lid, tags=ListingTags(), cached=False))

    logger.info("Analyze-URLs: done, %d results", len(results))
    return AnalyzeResponse(results=results)
