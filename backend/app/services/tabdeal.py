"""Tabdeal (Iranian exchange) helper for the USDT/IRT (Toman) rate.

Used to show users an approximate Toman value. Defensive: returns rate=None on
any failure instead of raising, so the dashboard never breaks.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

# Public Tabdeal market endpoint for the USDT/IRT pair.
TABDEAL_URL = "https://api.tabdeal.org/r/api/v1/depth/USDTIRT/"

CACHE_TTL = 5.0
_cache: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and entry[0] > time.monotonic():
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic() + CACHE_TTL, value)


async def get_usdt_irt() -> dict:
    """Return ``{"rate": <float or None>}`` for 1 USDT in Toman (IRT).

    Note: Tabdeal/Iranian markets usually quote in Rials; we divide by 10 to get
    Toman. On any error we return ``{"rate": None}`` (never 500).
    """
    cached = _cache_get("usdt_irt")
    if cached is not None:
        return cached

    rate: float | None = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(TABDEAL_URL)
            resp.raise_for_status()
            data = resp.json()
        rate = _extract_rate(data)
    except Exception:
        rate = None

    result = {"rate": rate}
    if rate is not None:
        _cache_set("usdt_irt", result)
    return result


def _extract_rate(data: Any) -> float | None:
    """Tolerantly find a usable rate from the order book or ticker JSON."""
    if not isinstance(data, dict):
        return None

    # Try the best ask/bid from an order book ("asks"/"bids" = [[price, amount]]).
    for side in ("asks", "bids"):
        levels = data.get(side)
        if isinstance(levels, list) and levels:
            try:
                price = float(levels[0][0])
                # Iranian exchanges quote in Rials; convert to Toman.
                return price / 10.0 if price > 100_000 else price
            except (TypeError, ValueError, IndexError):
                continue

    # Fall back to a plain price/last field if present.
    for key in ("price", "last", "lastPrice"):
        if key in data and data[key] is not None:
            try:
                price = float(data[key])
                return price / 10.0 if price > 100_000 else price
            except (TypeError, ValueError):
                continue

    return None
