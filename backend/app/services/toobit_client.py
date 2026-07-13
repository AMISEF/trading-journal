"""Signed Toobit futures REST client (per-user credentials).

Auth follows Toobit's documented scheme (same family as Binance/BHEX):
  • header ``X-BB-APIKEY: <api key>``
  • ``signature`` = HMAC-SHA256(secret, <the exact query string we send, incl.
    timestamp>) as a hex digest, appended as the final query parameter.

Only the read endpoints needed for the journal import are exposed. Every call is
defensive: network/API errors raise :class:`ToobitError` for the caller to log
per-user without crashing the sync loop.

⚠️ The signing and field mapping are implemented from the API docs but have not
been exercised against the live exchange in this environment — validate on the
server with a real read-only key on first rollout.
"""

from __future__ import annotations

import hashlib
import hmac
import time
import urllib.parse
from typing import Any

import httpx

DEFAULT_BASE = "https://api.toobit.com"


class ToobitError(RuntimeError):
    """Any failure talking to Toobit (network, HTTP status, or API error body)."""


class ToobitClient:
    def __init__(
        self,
        api_key: str,
        secret_key: str,
        *,
        base_url: str = DEFAULT_BASE,
        recv_window: int = 5000,
        timeout: float = 15.0,
    ) -> None:
        self._key = api_key
        self._secret = secret_key.encode("utf-8")
        self._base = base_url.rstrip("/")
        self._recv_window = recv_window
        self._timeout = httpx.Timeout(timeout, connect=10.0)

    # --- signing ---------------------------------------------------------------
    def _sign(self, query: str) -> str:
        return hmac.new(self._secret, query.encode("utf-8"), hashlib.sha256).hexdigest()

    async def _get(self, path: str, params: dict[str, Any] | None, *, signed: bool) -> Any:
        params = {k: v for k, v in (params or {}).items() if v is not None}
        if signed:
            params["timestamp"] = int(time.time() * 1000)
            params["recvWindow"] = self._recv_window
            # Sign the exact serialised query, then append the signature to it so
            # what we sign is byte-for-byte what we send.
            query = urllib.parse.urlencode(params)
            url = f"{self._base}{path}?{query}&signature={self._sign(query)}"
        else:
            query = urllib.parse.urlencode(params)
            url = f"{self._base}{path}" + (f"?{query}" if query else "")
        headers = {"X-BB-APIKEY": self._key} if signed else {}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise ToobitError(f"network error: {exc}") from exc
        if resp.status_code != 200:
            raise ToobitError(f"HTTP {resp.status_code}: {resp.text[:300]}")
        try:
            data = resp.json()
        except ValueError as exc:
            raise ToobitError(f"bad JSON: {resp.text[:200]}") from exc
        # Toobit error bodies look like {"code": <n>, "msg": "..."}.
        if isinstance(data, dict) and data.get("code") not in (None, 0, "0", 200):
            raise ToobitError(f"api error {data.get('code')}: {data.get('msg')}")
        return data

    # --- endpoints -------------------------------------------------------------
    async def positions(self) -> list[dict]:
        """Open positions — GET /api/v1/futures/positions (signed)."""
        data = await self._get("/api/v1/futures/positions", {}, signed=True)
        return data if isinstance(data, list) else []

    async def history_positions(self, *, start_ms: int | None = None, limit: int = 200) -> list[dict]:
        """Closed positions — GET /api/v1/futures/historyPositions (signed)."""
        data = await self._get(
            "/api/v1/futures/historyPositions",
            {"startTime": start_ms, "limit": limit},
            signed=True,
        )
        return data if isinstance(data, list) else []

    async def user_trades(self, symbol: str, *, start_ms: int | None = None, limit: int = 1000) -> list[dict]:
        """Fills for one symbol — GET /api/v1/futures/userTrades (signed)."""
        data = await self._get(
            "/api/v1/futures/userTrades",
            {"symbol": symbol, "startTime": start_ms, "limit": limit},
            signed=True,
        )
        return data if isinstance(data, list) else []

    async def open_orders(self, symbol: str | None = None) -> list[dict]:
        """Open orders (user-set TP/SL) — GET /api/v1/futures/openOrders (signed)."""
        data = await self._get(
            "/api/v1/futures/openOrders", {"symbol": symbol}, signed=True
        )
        return data if isinstance(data, list) else []

    async def klines(
        self, symbol: str, interval: str, *, start_ms: int | None = None,
        end_ms: int | None = None, limit: int = 200,
    ) -> list[list]:
        """Candles — GET /quote/v1/klines (public).

        Returns rows of [openTime, open, high, low, close, volume, closeTime, ...].
        """
        data = await self._get(
            "/quote/v1/klines",
            {"symbol": symbol, "interval": interval, "startTime": start_ms,
             "endTime": end_ms, "limit": limit},
            signed=False,
        )
        return data if isinstance(data, list) else []
