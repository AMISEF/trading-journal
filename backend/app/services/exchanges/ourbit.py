"""Ourbit USDT-M futures adapter.

Ourbit does not publish a standalone public API reference; its futures gateway
follows the widely used contract-API convention (identical to the MEXC-style
futures gateway it is built on):

* headers ``ApiKey``, ``Request-Time``, ``Signature``, ``Content-Type``
* ``Signature = HMAC_SHA256(secret, apiKey + timestamp + paramString)`` where
  ``paramString`` is the sorted query string for GET requests and the raw JSON
  body for POST requests.

Because the exact host/paths can differ per deploy, the base URL is overridable
with ``OURBIT_BASE_URL`` and every capability probes a list of candidate paths;
``GET /api/settings/exchanges/ourbit/debug`` shows which one answered.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode

from app.services.exchanges.base import (
    BaseExchangeClient,
    hmac_hex,
    now_ms,
    num,
    order_side_of,
    side_of,
)


class OurbitClient(BaseExchangeClient):
    slug = "ourbit"
    label = "Ourbit"
    default_base = "https://futures.ourbit.com"

    position_paths = (
        "/api/v1/private/position/open_positions",
        "/api/v1/private/position/list/open_positions",
    )
    history_paths = (
        "/api/v1/private/position/list/history_positions",
        "/api/v1/private/position/history_positions",
    )
    fills_paths = (
        "/api/v1/private/order/list/order_deals",
        "/api/v1/private/order/deals",
    )

    def _prepare(self, method: str, path: str, params: dict[str, Any] | None, body: dict | None):
        ts = str(now_ms())
        query = urlencode(sorted(params.items())) if params else ""
        content = None
        if method == "GET":
            param_string = query
        else:
            param_string = json.dumps(body or {}, separators=(",", ":"), ensure_ascii=False)
            content = param_string
        headers = {
            "ApiKey": self.api_key,
            "Request-Time": ts,
            "Signature": hmac_hex(self.secret_key, f"{self.api_key}{ts}{param_string}"),
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}{path}" + (f"?{query}" if query else "")
        return url, headers, content

    def _check(self, data: Any) -> Any:
        if isinstance(data, dict) and "success" in data:
            if not data.get("success"):
                from app.services.exchanges.base import ExchangeError

                raise ExchangeError(
                    f"Ourbit: کد {data.get('code')} — {data.get('message') or data.get('msg') or ''}"
                )
            return data
        return super()._check(data)

    # -- params ----------------------------------------------------------
    def history_params(self, start_ms: int | None, limit: int) -> dict[str, Any]:
        return {"page_num": 1, "page_size": min(limit, 100)}

    def fills_params(self, symbol: str | None, start_ms: int | None, limit: int) -> dict[str, Any]:
        params: dict[str, Any] = {"page_num": 1, "page_size": min(limit, 100)}
        if symbol:
            params["symbol"] = symbol
        if start_ms:
            params["start_time"] = int(start_ms)
        return params

    # -- mappers ---------------------------------------------------------
    def map_position(self, row: dict) -> dict | None:
        symbol = row.get("symbol")
        entry = num(row.get("holdAvgPrice")) or num(row.get("openAvgPrice")) or num(row.get("avgPrice"))
        qty = num(row.get("holdVol")) or num(row.get("positionSize")) or num(row.get("volume"))
        if not symbol or not entry or not qty:
            return None
        leverage = num(row.get("leverage"))
        margin = num(row.get("im")) or num(row.get("oim")) or num(row.get("margin"))
        notional = entry * abs(qty)
        if (margin is None or margin <= 0) and leverage:
            margin = notional / leverage
        # positionType: 1 = long, 2 = short
        return {
            "symbol": symbol,
            "side": "SHORT" if str(row.get("positionType")) == "2" else side_of(row.get("positionType")),
            "avgPrice": entry,
            "leverage": leverage,
            "margin": margin,
            "positionValue": notional,
            "realizedPnL": num(row.get("realised")) or num(row.get("realisedPnl")) or 0.0,
            "createTime": row.get("createTime") or row.get("openTime"),
        }

    def map_history(self, row: dict) -> dict | None:
        symbol = row.get("symbol")
        entry = num(row.get("openAvgPrice")) or num(row.get("holdAvgPrice"))
        if not symbol or not entry:
            return None
        pid = row.get("positionId") or row.get("id")
        qty = num(row.get("closeVol")) or num(row.get("holdVol")) or 0.0
        leverage = num(row.get("leverage"))
        return {
            "id": str(pid) if pid is not None else None,
            "symbol": symbol,
            "side": "SHORT" if str(row.get("positionType")) == "2" else side_of(row.get("positionType")),
            "openAvgPrice": entry,
            "closeAvgPrice": num(row.get("closeAvgPrice")),
            "leverage": leverage,
            "closeValue": (qty * entry) if qty else None,
            "maxPosition": qty,
            "realizedPnL": num(row.get("realised")) or num(row.get("profit")) or 0.0,
            "openTime": row.get("createTime") or row.get("openTime"),
            "closeTime": row.get("updateTime") or row.get("closeTime"),
        }

    def map_fill(self, row: dict) -> dict | None:
        price = num(row.get("price"))
        qty = num(row.get("vol")) or num(row.get("volume")) or num(row.get("qty"))
        # side: 1 open long, 2 close short, 3 open short, 4 close long
        side = order_side_of(row.get("side"))
        ts = row.get("timestamp") or row.get("time") or row.get("createTime")
        if not price or not qty or not side or ts is None:
            return None
        return {
            "symbol": row.get("symbol"),
            "price": price,
            "qty": qty,
            "side": side,
            "time": ts,
            "fee": num(row.get("fee")) or 0.0,
            "leverage": num(row.get("leverage")),
        }
