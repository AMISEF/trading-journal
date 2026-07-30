"""XT.com USDT-M futures adapter (https://doc.xt.com).

Auth (futures): every private call carries the headers ``validate-appkey``,
``validate-timestamp``, ``validate-recvwindow``, ``validate-algorithms`` and
``validate-signature``. The signature is
``HMAC_SHA256(secret, X + Y)`` where::

    X = "validate-algorithms=HmacSHA256&validate-appkey=..&validate-recvwindow=..&validate-timestamp=.."
    Y = "#" + path + "#" + sortedQueryString      (GET)
    Y = "#" + path + "#" + jsonBody               (POST)

XT exposes no closed-position endpoint — only order/fill history — so closed
trades are rebuilt from the fills and their PnL is derived there
(``derive_pnl_from_fills``).
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


class XtClient(BaseExchangeClient):
    slug = "xt"
    label = "XT"
    default_base = "https://fapi.xt.com"
    derive_pnl_from_fills = True

    position_paths = ("/future/user/v1/position/list",)
    history_paths = ()
    fills_paths = ("/future/trade/v1/order/trade-list",)

    def _prepare(self, method: str, path: str, params: dict[str, Any] | None, body: dict | None):
        ts = str(now_ms())
        header_part = (
            "validate-algorithms=HmacSHA256"
            f"&validate-appkey={self.api_key}"
            f"&validate-recvwindow={self.recv_window}"
            f"&validate-timestamp={ts}"
        )
        query = ""
        content = None
        if method == "GET":
            if params:
                query = urlencode(sorted(params.items()))
            payload = f"{header_part}#{path}#{query}" if query else f"{header_part}#{path}"
            content_type = "application/x-www-form-urlencoded"
        else:
            raw = json.dumps(body or {}, separators=(",", ":"), ensure_ascii=False)
            content = raw
            payload = f"{header_part}#{path}#{raw}"
            content_type = "application/json"

        headers = {
            "validate-algorithms": "HmacSHA256",
            "validate-appkey": self.api_key,
            "validate-recvwindow": str(self.recv_window),
            "validate-timestamp": ts,
            "validate-signature": hmac_hex(self.secret_key, payload),
            "Content-Type": content_type,
        }
        url = f"{self.base_url}{path}" + (f"?{query}" if query else "")
        return url, headers, content

    # XT wraps everything in {error, msgInfo, result, returnCode}.
    def _check(self, data: Any) -> Any:
        if isinstance(data, dict):
            code = data.get("returnCode")
            err = data.get("error") or {}
            if code not in (None, 0, "0"):
                msg = (err.get("msg") if isinstance(err, dict) else "") or data.get("msgInfo") or ""
                from app.services.exchanges.base import ExchangeError

                raise ExchangeError(f"XT: کد {code} — {msg}")
        return data

    # -- params ----------------------------------------------------------
    def fills_params(self, symbol: str | None, start_ms: int | None, limit: int) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": min(limit, 1000), "direction": "NEXT"}
        if symbol:
            params["symbol"] = symbol
        if start_ms:
            params["startTime"] = int(start_ms)
        return params

    # -- mappers ---------------------------------------------------------
    def map_position(self, row: dict) -> dict | None:
        symbol = row.get("symbol")
        size = num(row.get("positionSize"))
        entry = num(row.get("entryPrice")) or num(row.get("openAvgPrice"))
        if not symbol or not entry or not size:
            return None
        leverage = num(row.get("leverage"))
        margin = num(row.get("isolatedMargin")) or num(row.get("positionMargin"))
        notional = entry * abs(size)
        if (margin is None or margin <= 0) and leverage:
            margin = notional / leverage
        return {
            "symbol": symbol,
            "side": side_of(row.get("positionSide")),
            "avgPrice": entry,
            "leverage": leverage,
            "margin": margin,
            "positionValue": notional,
            "realizedPnL": num(row.get("realizedProfit")) or 0.0,
            "createTime": row.get("createdTime") or row.get("createTime") or row.get("timestamp"),
        }

    def map_fill(self, row: dict) -> dict | None:
        price = num(row.get("price"))
        qty = num(row.get("quantity")) or num(row.get("execQty")) or num(row.get("qty"))
        side = order_side_of(row.get("orderSide") or row.get("side"))
        ts = row.get("timestamp") or row.get("time") or row.get("createdTime")
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
