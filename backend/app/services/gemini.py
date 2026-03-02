import asyncio
import json
import logging
import re

from openai import AsyncOpenAI

from app.config import settings
from app.models import ListingTags

logger = logging.getLogger(__name__)

# ── Client & model ─────────────────────────────────────────────────────────────

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """\
You are a Singapore rental listing analyzer. Extract information from listing texts.
Use a non-unknown value when the text clearly states or strongly implies it \
(e.g. "master bedroom" → room_type: "master_room", "attached bathroom" → bathroom: "private", \
"no cooking" → cooking_policy: "no_cooking"). Only use "unknown" when the text says nothing about that aspect.

Each listing result must be a JSON object with EXACTLY these fields:
- "cooking_policy": one of "heavy_cooking_ok", "light_cooking_only", "no_cooking", "unknown"
- "owner_occupancy": one of "owner_stays", "owner_not_staying", "unknown"
- "address_registration": one of "allowed", "not_allowed", "unknown"
- "room_type": one of "master_room", "common_room", "studio", "whole_unit", "partition", "unknown"
- "bathroom": one of "private", "shared", "unknown"
- "agent_fee": one of "no_agent_fee", "has_agent_fee", "half_month", "unknown"
- "lease_term_months": integer number of months, or null if unknown
- "gender_preference": one of "male_only", "female_only", "couples_ok", "any", "unknown"
- "visitor_policy": one of "allowed", "restricted", "not_allowed", "unknown"
- "additional_flags": a list of short strings (2-4 words) for UNIT-LEVEL details only, \
e.g. "aircon provided", "wifi included", "no pets", "furnished", "high floor", "newly renovated". \
Do NOT include condo-level amenities (pool, gym, near MRT). Return [] if none.

Return ONLY valid JSON, no explanation or markdown."""

_semaphore = asyncio.Semaphore(10)

# ── Value coercion maps ────────────────────────────────────────────────────────

_COOKING_MAP = {
    "heavy_cooking": "heavy_cooking_ok", "heavy": "heavy_cooking_ok",
    "light_cooking": "light_cooking_only", "light": "light_cooking_only",
    "no_cooking": "no_cooking", "not_allowed": "no_cooking",
}
_OWNER_MAP = {
    "yes": "owner_stays", "true": "owner_stays", "live_in": "owner_stays",
    "no": "owner_not_staying", "false": "owner_not_staying",
}
_ROOM_MAP = {
    "single_room": "common_room", "single room": "common_room",
    "single": "common_room", "room": "unknown",
    "master": "master_room", "common": "common_room",
    "entire_unit": "whole_unit", "entire unit": "whole_unit",
    "whole unit": "whole_unit",
}
_BATHROOM_MAP = {
    "attached": "private", "ensuite": "private", "en-suite": "private",
    "common": "shared",
}
_GENDER_MAP = {
    "male": "male_only", "female": "female_only",
    "same_gender": "unknown", "same gender": "unknown",
    "no_preference": "any", "no preference": "any", "none": "any",
}
_VISITOR_MAP = {
    "no_visitors": "not_allowed", "no visitors": "not_allowed",
    "limited": "restricted",
}
_AGENT_MAP = {
    "no": "no_agent_fee", "false": "no_agent_fee", "none": "no_agent_fee",
    "yes": "has_agent_fee", "true": "has_agent_fee",
    "half": "half_month", "0.5_month": "half_month",
}
_ADDR_MAP = {
    "yes": "allowed", "true": "allowed", "can_register": "allowed",
    "no": "not_allowed", "false": "not_allowed",
}


def _coerce(value, valid_values: set[str], alias_map: dict[str, str]) -> str:
    if not isinstance(value, str):
        return "unknown"
    v = value.strip().lower()
    if v in valid_values:
        return v
    if v in alias_map:
        return alias_map[v]
    return "unknown"


def _sanitize_tags(data: dict) -> dict:
    cooking_vals = {"heavy_cooking_ok", "light_cooking_only", "no_cooking", "unknown"}
    owner_vals = {"owner_stays", "owner_not_staying", "unknown"}
    addr_vals = {"allowed", "not_allowed", "unknown"}
    room_vals = {"master_room", "common_room", "studio", "whole_unit", "partition", "unknown"}
    bath_vals = {"private", "shared", "unknown"}
    agent_vals = {"no_agent_fee", "has_agent_fee", "half_month", "unknown"}
    gender_vals = {"male_only", "female_only", "couples_ok", "any", "unknown"}
    visitor_vals = {"allowed", "restricted", "not_allowed", "unknown"}

    result = {
        "cooking_policy": _coerce(data.get("cooking_policy", "unknown"), cooking_vals, _COOKING_MAP),
        "owner_occupancy": _coerce(data.get("owner_occupancy", "unknown"), owner_vals, _OWNER_MAP),
        "address_registration": _coerce(data.get("address_registration", "unknown"), addr_vals, _ADDR_MAP),
        "room_type": _coerce(data.get("room_type", "unknown"), room_vals, _ROOM_MAP),
        "bathroom": _coerce(data.get("bathroom", "unknown"), bath_vals, _BATHROOM_MAP),
        "agent_fee": _coerce(data.get("agent_fee", "unknown"), agent_vals, _AGENT_MAP),
        "gender_preference": _coerce(data.get("gender_preference", "unknown"), gender_vals, _GENDER_MAP),
        "visitor_policy": _coerce(data.get("visitor_policy", "unknown"), visitor_vals, _VISITOR_MAP),
    }

    ltm = data.get("lease_term_months")
    if isinstance(ltm, (int, float)) and ltm > 0:
        result["lease_term_months"] = int(ltm)
    elif isinstance(ltm, str):
        m = re.search(r"(\d+)", ltm)
        result["lease_term_months"] = int(m.group(1)) if m else None
    else:
        result["lease_term_months"] = None

    flags = data.get("additional_flags", [])
    if isinstance(flags, list):
        result["additional_flags"] = [str(f).strip() for f in flags if f and str(f).strip()]
    else:
        result["additional_flags"] = []

    return result


def _extract_json_object(raw: str) -> str:
    """Strip markdown fences and extract the first top-level JSON object."""
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start = raw.find("{")
    if start == -1:
        return raw
    depth = 0
    for i in range(start, len(raw)):
        if raw[i] == "{":
            depth += 1
        elif raw[i] == "}":
            depth -= 1
            if depth == 0:
                return raw[start : i + 1]
    return raw[start:]


def _extract_json_array(raw: str) -> str:
    """Strip markdown fences and extract the first top-level JSON array."""
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start = raw.find("[")
    if start == -1:
        return raw
    depth = 0
    for i in range(start, len(raw)):
        if raw[i] == "[":
            depth += 1
        elif raw[i] == "]":
            depth -= 1
            if depth == 0:
                return raw[start : i + 1]
    return raw[start:]


# ── Main extraction ────────────────────────────────────────────────────────────

MAX_RETRIES = 2
RETRY_DELAY = 5


async def _call_openai(prompt: str) -> str:
    """Call OpenAI chat completion and return the response text."""
    response = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or ""


async def extract_tags(text: str) -> ListingTags:
    """Extract tags from a single listing."""
    if not text or len(text.strip()) < 30:
        logger.warning("Text too short (%d chars), skipping", len(text) if text else 0)
        return ListingTags()

    prompt = (
        f"Analyze this Singapore rental listing:\n\n{text}\n\n"
        f"Respond with ONLY the JSON object:"
    )

    for attempt in range(MAX_RETRIES + 1):
        async with _semaphore:
            try:
                raw = await _call_openai(prompt)
                data = json.loads(raw)
                sanitized = _sanitize_tags(data)
                tags = ListingTags(**sanitized)

                if tags.is_all_unknown():
                    logger.warning("All unknown for text (%d chars). Raw: %s", len(text), raw[:500])
                else:
                    logger.info("Tags: %s", tags.model_dump_json())
                return tags

            except Exception as e:
                err_str = str(e)
                is_rate_limit = "429" in err_str or "rate" in err_str.lower()

                if is_rate_limit and attempt < MAX_RETRIES:
                    delay = RETRY_DELAY * (attempt + 1)
                    logger.warning("Rate limited (attempt %d/%d), retrying in %ds", attempt + 1, MAX_RETRIES + 1, delay)
                    await asyncio.sleep(delay)
                    continue

                logger.error("extract_tags failed (attempt %d/%d): %s", attempt + 1, MAX_RETRIES + 1, e)
                return ListingTags()

    return ListingTags()


async def extract_tags_batch(
    listings: list[tuple[str, str]],
) -> dict[str, ListingTags]:
    """
    Extract tags for multiple listings in a single OpenAI API call.
    """
    valid = [(lid, text) for lid, text in listings if text and len(text.strip()) >= 30]
    if not valid:
        return {}

    numbered_texts = []
    for i, (lid, text) in enumerate(valid, 1):
        truncated = text[:1000]
        numbered_texts.append(f"=== LISTING {i} (ID: {lid}) ===\n{truncated}")

    combined = "\n\n".join(numbered_texts)
    prompt = (
        f"Analyze these {len(valid)} Singapore rental listings.\n"
        f"Return a JSON object with a \"results\" key containing an array "
        f"of {len(valid)} objects, one per listing, in the same order. "
        f"Each object must include an \"id\" field matching the listing ID.\n\n"
        f"{combined}\n\n"
        f"Respond with ONLY the JSON:"
    )

    for attempt in range(MAX_RETRIES + 1):
        async with _semaphore:
            try:
                raw = await _call_openai(prompt)
                data = json.loads(raw)

                items = data.get("results", data) if isinstance(data, dict) else data
                if isinstance(items, dict) and not isinstance(items, list):
                    items = list(items.values()) if items else []

                if not isinstance(items, list):
                    logger.error("Batch response is not an array: %s", raw[:500])
                    break

                result: dict[str, ListingTags] = {}
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    lid = str(item.get("id", ""))
                    if not lid:
                        continue
                    sanitized = _sanitize_tags(item)
                    tags = ListingTags(**sanitized)
                    result[lid] = tags
                    if not tags.is_all_unknown():
                        logger.info("Batch tag [%s]: %s", lid, tags.model_dump_json())

                logger.info(
                    "Batch extracted %d/%d listings in 1 API call",
                    len(result), len(valid),
                )
                return result

            except Exception as e:
                err_str = str(e)
                is_rate_limit = "429" in err_str or "rate" in err_str.lower()

                if is_rate_limit and attempt < MAX_RETRIES:
                    delay = RETRY_DELAY * (attempt + 1)
                    logger.warning(
                        "Batch rate limited (attempt %d/%d), retrying in %ds",
                        attempt + 1, MAX_RETRIES + 1, delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                logger.error("extract_tags_batch failed (attempt %d/%d): %s", attempt + 1, MAX_RETRIES + 1, e)
                break

    return {}
