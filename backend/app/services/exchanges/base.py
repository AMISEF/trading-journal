"""Shared plumbing for the multi-exchange futures integrations.

Every adapter normalises its exchange's REST responses into the *Toobit shape*
that the journal importer already consumes, so one proven reconstruction
algorithm (:mod:`app.services.exchange_sync`) works for all of them:

``positions()``
    ``[{symbol, side: LONG|SHORT, avgPrice, leverage, margin, positionValue,
       realizedPnL, createTime}]``
``history_positions(start_ms, limit)``
    ``[{id, symbol, side, openAvgPrice, closeAvgPrice, leverage, closeValue,
       maxPosition, realizedPnL, openTime, closeTime}]``
``user_trades(symbol, start_ms, limit)``
    ``[{symbol, price, qty, side: BUY|SELL, time}]``

Design notes
------------
* Several of these exchanges publish their private endpoints only in
  JS-rendered docs, and deploys differ between regions. Each adapter therefore
  declares a *list of candidate paths* per capability and
  :meth:`BaseExchangeClient._try_paths` uses the first one that answers
  successfully, remembering it for the rest of the process. ``GET /debug``
  reports which path won, so the integration can be verified on the server
  without a redeploy.
* Nothing here raises inside the sync loop except :class:`ExchangeError`, which
  the caller surfaces to the user in the settings panel.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import random
import string
import time
from typing import Any, Iterable
from urllib.parse import urlencode

import httpx

logger = logging.getLogger("app.services.exchanges")


class ExchangeError(RuntimeError):
    """Any failure while talking to an exchange (network, auth, bad payload)."""


def now_ms() -> int:
    return int(time.time() * 1000)


def num(v: Any) -> float | None:
    """Lenient float conversion — exchanges mix strings, numbers and nulls."""
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def abs_num(v: Any) -> float | None:
    n = num(v)
    return abs(n) if n is not None else None


def rand_str(length: int = 34) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


def hmac_hex(secret: str, payload: str) -> str:
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def hmac_b64(secret: str, payload: str) -> str:
    import base64

    digest = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def md5_upper(payload: str) -> str:
    return hashlib.md5(payload.encode("utf-8")).hexdigest().upper()


def unwrap(data: Any) -> list[dict]:
    """Pull the row list out of the many envelope shapes exchanges return."""
    if data is None:
        return []
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        for key in ("data", "result", "rows", "list", "items", "records", "content", "resultList"):
            if key in data:
                return unwrap(data.get(key))
        # A single object is a one-row list.
        return [data]
    return []


def side_of(value: Any, *, long_words: Iterable[str] = ("long", "buy", "1", "open_long", "openlong")) -> str:
    """Normalise any of the exchanges' side encodings to LONG/SHORT."""
    s = str(value or "").strip().lower()
    if not s:
        return "LONG"
    if s in ("2", "3", "4") or "short" in s or "sell" in s:
        return "SHORT"
    if s in long_words or "long" in s or "buy" in s:
        return "LONG"
    return "LONG"


def order_side_of(value: Any) -> str:
    """Normalise a *fill's* side to BUY/SELL (what opens/closes a position).

    Exchanges encode this either directly (BUY/SELL) or as an action
    (open_long / close_long / 1..4). ``open_long`` and ``close_short`` are both
    buys; ``open_short`` and ``close_long`` are both sells.
    """
    s = str(value or "").strip().lower()
    if not s:
        return ""
    if s in ("1", "4"):  # 1 = open long, 4 = close short (MEXC-style encoding)
        return "BUY"
    if s in ("2", "3"):  # 2 = close short? / 3 = open short — see adapter notes
        return "SELL"
    if "open_long" in s or "openlong" in s or "close_short" in s or "closeshort" in s:
        return "BUY"
    if "open_short" in s or "openshort" in s or "close_long" in s or "closelong" in s:
        return "SELL"
    if s.startswith("buy") or s == "b":
        return "BUY"
    if s.startswith("sell") or s == "s":
        return "SELL"
    return ""


class BaseExchangeClient:
    """Common HTTP + signing scaffolding. Adapters override the sign/parse bits."""

    slug: str = ""
    label: str = ""
    default_base: str = ""
    needs_passphrase: bool = False
    # When the exchange exposes no closed-position endpoint, the importer
    # derives PnL from the fills instead of dropping the trade.
    derive_pnl_from_fills: bool = False
    # Some exchanges return every fill in one call; then per-symbol requests
    # are skipped entirely (much cheaper and avoids symbol-format mismatches).
    fills_are_global: bool = False

    position_paths: tuple[str, ...] = ()
    history_paths: tuple[str, ...] = ()
    fills_paths: tuple[str, ...] = ()

    def __init__(
        self,
        api_key: str,
        secret_key: str,
        passphrase: str | None = None,
        *,
        base_url: str | None = None,
        recv_window: int = 5000,
        timeout: float = 15.0,
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.secret_key = (secret_key or "").strip()
        self.passphrase = (passphrase or "").strip() or None
        self.base_url = (base_url or self.default_base).rstrip("/")
        self.recv_window = recv_window
        self.timeout = timeout
        # Remembers the candidate path that worked, per capability.
        self._resolved: dict[str, str] = {}

    # -- signing ---------------------------------------------------------
    def _prepare(
        self, method: str, path: str, params: dict[str, Any] | None, body: dict | None
    ) -> tuple[str, dict[str, str], str | None]:
        """Return (url, headers, content) for a signed request.

        Adapters implement this; ``params`` must be signed exactly as sent.
        """
        raise NotImplementedError

    # -- transport -------------------------------------------------------
    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        body: dict | None = None,
    ) -> Any:
        clean = {k: v for k, v in (params or {}).items() if v is not None and v != ""}
        url, headers, content = self._prepare(method.upper(), path, clean, body)
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.request(method.upper(), url, headers=headers, content=content)
        except httpx.HTTPError as exc:
            raise ExchangeError(f"{self.label or self.slug}: ارتباط شبکه‌ای برقرار نشد ({exc}).") from exc

        text = resp.text or ""
        if resp.status_code != 200:
            raise ExchangeError(f"{self.label or self.slug}: HTTP {resp.status_code} — {text[:200]}")
        try:
            data = resp.json()
        except json.JSONDecodeError as exc:
            raise ExchangeError(f"{self.label or self.slug}: پاسخ نامعتبر — {text[:200]}") from exc
        return self._check(data)

    def _check(self, data: Any) -> Any:
        """Raise on an application-level error envelope; adapters may override."""
        if isinstance(data, dict):
            code = data.get("code", data.get("returnCode", data.get("result_code")))
            if code not in (None, 0, "0", 200, "200", "00000", True, "true"):
                msg = data.get("msg") or data.get("message") or data.get("msgInfo") or ""
                err = data.get("error")
                if isinstance(err, dict) and err.get("msg"):
                    msg = err.get("msg")
                raise ExchangeError(f"{self.label or self.slug}: کد {code} — {msg}")
        return data

    async def _try_paths(
        self,
        capability: str,
        paths: tuple[str, ...],
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        body: dict | None = None,
    ) -> tuple[Any, str]:
        """Call the first candidate path that answers; remember the winner.

        Raises the *last* error when every candidate fails, so the settings
        panel shows something actionable instead of a generic message.
        """
        ordered = (self._resolved.get(capability),) if self._resolved.get(capability) else ()
        ordered = ordered + tuple(p for p in paths if p != self._resolved.get(capability))
        if not ordered:
            raise ExchangeError(f"{self.label or self.slug}: مسیری برای {capability} تعریف نشده است.")
        last: Exception | None = None
        for path in ordered:
            try:
                data = await self.request(method, path, params=params, body=body)
            except ExchangeError as exc:
                last = exc
                continue
            self._resolved[capability] = path
            return data, path
        raise ExchangeError(str(last) if last else f"{self.label}: {capability} در دسترس نیست.")

    # -- normalised capabilities (adapters override the mappers) ----------
    def map_position(self, row: dict) -> dict | None:
        raise NotImplementedError

    def map_history(self, row: dict) -> dict | None:
        return None

    def map_fill(self, row: dict) -> dict | None:
        raise NotImplementedError

    def position_params(self) -> dict[str, Any]:
        return {}

    def history_params(self, start_ms: int | None, limit: int) -> dict[str, Any]:
        return {}

    def fills_params(self, symbol: str | None, start_ms: int | None, limit: int) -> dict[str, Any]:
        return {}

    async def positions(self) -> list[dict]:
        if not self.position_paths:
            return []
        data, _ = await self._try_paths("positions", self.position_paths, params=self.position_params())
        out = []
        for row in unwrap(data):
            mapped = self.map_position(row)
            if mapped:
                out.append(mapped)
        return out

    async def history_positions(self, start_ms: int | None = None, limit: int = 500) -> list[dict]:
        if not self.history_paths:
            return []
        data, _ = await self._try_paths(
            "history", self.history_paths, params=self.history_params(start_ms, limit)
        )
        out = []
        for row in unwrap(data):
            mapped = self.map_history(row)
            if mapped:
                out.append(mapped)
        return out

    async def user_trades(
        self, symbol: str | None = None, start_ms: int | None = None, limit: int = 1000
    ) -> list[dict]:
        if not self.fills_paths:
            return []
        data, _ = await self._try_paths(
            "fills", self.fills_paths, params=self.fills_params(symbol, start_ms, limit)
        )
        out = []
        for row in unwrap(data):
            mapped = self.map_fill(row)
            if mapped:
                out.append(mapped)
        return out

    # -- diagnostics -----------------------------------------------------
    async def debug(self, start_ms: int | None = None) -> dict:
        """Probe each capability and report raw outcomes (used by /debug)."""
        report: dict[str, Any] = {
            "exchange": self.slug,
            "baseUrl": self.base_url,
            "needsPassphrase": self.needs_passphrase,
        }

        async def probe(name: str, coro):
            try:
                rows = await coro
                report[name] = {
                    "ok": True,
                    "path": self._resolved.get(name.replace("Probe", "")),
                    "count": len(rows),
                    "sample": rows[:2],
                }
            except Exception as exc:  # noqa: BLE001 - diagnostics must not raise
                report[name] = {"ok": False, "error": str(exc)[:400]}

        await probe("positions", self.positions())
        await probe("history", self.history_positions(start_ms=start_ms, limit=20))
        symbol = None
        pos = report.get("positions") or {}
        if pos.get("ok") and pos.get("sample"):
            symbol = (pos["sample"][0] or {}).get("symbol")
        hist = report.get("history") or {}
        if symbol is None and hist.get("ok") and hist.get("sample"):
            symbol = (hist["sample"][0] or {}).get("symbol")
        await probe("fills", self.user_trades(symbol=symbol, start_ms=start_ms, limit=20))
        return report


__all__ = [
    "BaseExchangeClient",
    "ExchangeError",
    "abs_num",
    "hmac_b64",
    "hmac_hex",
    "md5_upper",
    "now_ms",
    "num",
    "order_side_of",
    "rand_str",
    "side_of",
    "unwrap",
    "urlencode",
    "asyncio",
]
