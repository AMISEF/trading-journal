"""Toobit market-data helpers (symbols, prices, tick sizes).

All requests go through httpx with a tiny in-memory cache (~5 seconds) so we
don't hammer the exchange. Every function is defensive: if the network call
fails or the API returns an unexpected shape, we fall back to sane defaults so
the app keeps working in Phase 1 (no API key required).
"""

from __future__ import annotations

import time
from typing import Any

import httpx

# Base URL for the public Toobit API.
TOOBIT_BASE = "https://api.toobit.com"

# How long (seconds) cached responses stay fresh.
CACHE_TTL = 5.0

# Simple fallback list used when the exchange API is unreachable.
FALLBACK_SYMBOLS = [
    "BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA",
    "AVAX", "LINK", "DOT", "MATIC", "LTC", "TRX", "ATOM",
]
FALLBACK_TICK = 0.01

# In-memory cache: key -> (expires_at_epoch, value).
_cache: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and entry[0] > time.monotonic():
        return entry[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (time.monotonic() + CACHE_TTL, value)


def to_toobit(base: str) -> str:
    """Convert a user symbol like "BTC" into Toobit's contract id "BTC-SWAP-USDT"."""
    return f"{base.strip().upper()}-SWAP-USDT"


def _base_from_contract(symbol: str) -> str | None:
    """Parse a base symbol from a contract id, e.g. "BTC-SWAP-USDT" -> "BTC"."""
    if not symbol:
        return None
    # Most Toobit perpetuals look like "BTC-SWAP-USDT". Take the first segment.
    return symbol.split("-")[0].strip().upper() or None


async def get_symbols(q: str = "", limit: int = 20) -> list[dict]:
    """Return base symbols (with tick size) optionally filtered by query ``q``.

    Shape: ``[{"symbol": "BTC", "tickSize": 0.01}, ...]``
    """
    q = (q or "").strip().upper()
    symbols = _cache_get("symbols")

    if symbols is None:
        symbols = await _fetch_symbols()
        _cache_set("symbols", symbols)

    # Filter: prefix match first, then "contains" match, case-insensitive.
    if q:
        prefix = [s for s in symbols if s["symbol"].startswith(q)]
        contains = [
            s for s in symbols if q in s["symbol"] and not s["symbol"].startswith(q)
        ]
        result = prefix + contains
    else:
        result = symbols

    return result[:limit]


async def _fetch_symbols() -> list[dict]:
    """Fetch and parse the exchange contract list, with a fallback on any error."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{TOOBIT_BASE}/api/v1/exchangeInfo")
            resp.raise_for_status()
            data = resp.json()

        contracts = data.get("contracts") or data.get("symbols") or []
        seen: dict[str, dict] = {}
        for c in contracts:
            raw_symbol = c.get("symbol") or c.get("contractName") or ""
            base = _base_from_contract(raw_symbol)
            if not base:
                continue
            tick = _extract_tick_size(c)
            # Keep the first occurrence of each base symbol.
            if base not in seen:
                seen[base] = {"symbol": base, "tickSize": tick}

        parsed = sorted(seen.values(), key=lambda s: s["symbol"])
        if parsed:
            return parsed
    except Exception:
        # Any failure (network, JSON, shape) -> use the fallback list.
        pass

    return [{"symbol": s, "tickSize": FALLBACK_TICK} for s in FALLBACK_SYMBOLS]


def _extract_tick_size(contract: dict) -> float:
    """Pull a tick size out of a contract record in a tolerant way."""
    # Direct tick size field.
    tick = contract.get("tickSize")
    if tick is not None:
        try:
            return float(tick)
        except (TypeError, ValueError):
            pass

    # Otherwise derive from priceScale / pricePrecision (number of decimals).
    scale = contract.get("priceScale", contract.get("pricePrecision"))
    if scale is not None:
        try:
            return 10 ** (-int(scale))
        except (TypeError, ValueError):
            pass

    return FALLBACK_TICK


async def get_price(base: str) -> dict:
    """Return the latest price for a base symbol.

    Shape: ``{"symbol": "BTC", "price": 12345.6, "raw": "BTC-SWAP-USDT"}``.
    On failure ``price`` is None (never raises / 500s).
    """
    base = (base or "").strip().upper()
    raw = to_toobit(base)
    cache_key = f"price:{raw}"

    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    price: float | None = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"{TOOBIT_BASE}/quote/v1/contract/ticker/price",
                params={"symbol": raw},
            )
            resp.raise_for_status()
            data = resp.json()
        price = _extract_price(data)
    except Exception:
        price = None

    result = {"symbol": base, "price": price, "raw": raw}
    # Only cache successful lookups so failures retry quickly.
    if price is not None:
        _cache_set(cache_key, result)
    return result


def _extract_price(data: Any) -> float | None:
    """Tolerantly extract a numeric price from various JSON shapes."""
    # The API may return a list of tickers or a single object.
    if isinstance(data, list):
        data = data[0] if data else {}
    if not isinstance(data, dict):
        return None
    for key in ("price", "p", "last", "lastPrice", "c"):
        if key in data and data[key] is not None:
            try:
                return float(data[key])
            except (TypeError, ValueError):
                continue
    return None


async def get_tick_size(base: str) -> dict:
    """Return ``{"symbol": "BTC", "tickSize": 0.01}`` for a base symbol."""
    base = (base or "").strip().upper()
    symbols = await get_symbols(q="", limit=10_000)
    for s in symbols:
        if s["symbol"] == base:
            return {"symbol": base, "tickSize": s["tickSize"]}
    return {"symbol": base, "tickSize": FALLBACK_TICK}
