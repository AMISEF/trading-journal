"""Tabdeal (Iranian exchange) helper for the USDT/IRT (Toman) rate.

Used to show users an approximate Toman value. Defensive: returns rate=None on
any failure instead of raising, so the dashboard never breaks.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

# Public Tabdeal market endpoint for the USDT/IRT pair.
TABDEAL_URL = "https://api.tabdeal.org/r/api/v1/depth/"

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

    Tabdeal's IRT market is already quoted in Toman. On any error we return
    ``{"rate": None}`` (never 500).
    """
    cached = _cache_get("usdt_irt")
    if cached is not None:
        return cached

    rate: float | None = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(TABDEAL_URL, params={"symbol": "USDTIRT", "limit": 5})
            resp.raise_for_status()
            data = resp.json()
        rate = _extract_rate(data)
        if rate is not None:
            rate = float(round(rate))
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

    # Use the midpoint of the best ask and bid when both sides are present.
    best: dict[str, float] = {}
    for side in ("asks", "bids"):
        levels = data.get(side)
        if isinstance(levels, list) and levels:
            try:
                price = float(levels[0][0])
                if price > 0:
                    best[side] = price
            except (TypeError, ValueError, IndexError):
                continue
    if "asks" in best and "bids" in best:
        return (best["asks"] + best["bids"]) / 2.0
    if best:
        return next(iter(best.values()))

    # Fall back to a plain price/last field if present.
    for key in ("price", "last", "lastPrice"):
        if key in data and data[key] is not None:
            try:
                price = float(data[key])
                return price if price > 0 else None
            except (TypeError, ValueError):
                continue

    return None
