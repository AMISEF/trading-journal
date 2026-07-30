"""LBank USDT-M contract adapter (https://www.lbank.com/docs/contract.html).

Auth: all private calls go to ``/cfd/openApi/v1/prv/...`` on
``https://lbkperp.lbank.com`` and are signed like this:

1. take every request parameter plus ``api_key``, ``signature_method``,
   ``timestamp`` and ``echostr`` and sort them by parameter name;
2. ``preparedStr = MD5(sortedQueryString).upper()``;
3. ``sign = HMAC_SHA256(secret, preparedStr)`` (hex).

The headers must repeat ``timestamp``, ``signature_method`` and ``echostr``
exactly as signed; ``echostr`` is a random 30–40 char string per request.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode

from app.services.exchanges.base import (
    BaseExchangeClient,
    hmac_hex,
    md5_upper,
    now_ms,
    num,
    order_side_of,
    rand_str,
    side_of,
)

PRODUCT_GROUP = "SwapU"


class LbankClient(BaseExchangeClient):
    slug = "lbank"
    label = "LBank"
    default_base = "https://lbkperp.lbank.com"

    position_paths = (
        "/cfd/openApi/v1/prv/position",
        "/cfd/openApi/v1/prv/positions",
    )
    history_paths = (
        "/cfd/openApi/v1/prv/positionHistory",
        "/cfd/openApi/v1/prv/historyPosition",
        "/cfd/openApi/v1/prv/position/history",
    )
    fills_paths = (
        "/cfd/openApi/v1/prv/tradeHistory",
        "/cfd/openApi/v1/prv/orderTrades",
        "/cfd/openApi/v1/prv/trades",
    )

    def _prepare(self, method: str, path: str, params: dict[str, Any] | None, body: dict | None):
        ts = str(now_ms())
        echostr = rand_str(34)
        signed: dict[str, Any] = dict(params or {})
        if method != "GET" and body:
            signed.update(body)
        signed.update(
            {
                "api_key": self.api_key,
                "signature_method": "HmacSHA256",
                "timestamp": ts,
                "echostr": echostr,
            }
        )
        prepared = md5_upper("&".join(f"{k}={signed[k]}" for k in sorted(signed)))
        sign = hmac_hex(self.secret_key, prepared)

        headers = {
            "timestamp": ts,
            "signature_method": "HmacSHA256",
            "echostr": echostr,
            "Content-Type": "application/json" if method != "GET" else "application/x-www-form-urlencoded",
        }
        content = None
        if method == "GET":
            query = urlencode(sorted({**signed, "sign": sign}.items()))
            url = f"{self.base_url}{path}?{query}"
        else:
            url = f"{self.base_url}{path}"
            content = json.dumps({**signed, "sign": sign}, separators=(",", ":"), ensure_ascii=False)
        return url, headers, content

    def _check(self, data: Any) -> Any:
        if isinstance(data, dict):
            code = data.get("result_code", data.get("error_code", data.get("code")))
            if code not in (None, 0, "0", 200, "200", True, "true", "success"):
                from app.services.exchanges.base import ExchangeError

                raise ExchangeError(f"LBank: کد {code} — {data.get('msg') or data.get('message') or ''}")
        return data

    # -- params ----------------------------------------------------------
    def position_params(self) -> dict[str, Any]:
        return {"productGroup": PRODUCT_GROUP, "asset": "USDT"}

    def history_params(self, start_ms: int | None, limit: int) -> dict[str, Any]:
        params: dict[str, Any] = {"productGroup": PRODUCT_GROUP, "pageSize": min(limit, 100), "pageNum": 1}
        if start_ms:
            params["startTime"] = int(start_ms)
        return params

    def fills_params(self, symbol: str | None, start_ms: int | None, limit: int) -> dict[str, Any]:
        params: dict[str, Any] = {"productGroup": PRODUCT_GROUP, "pageSize": min(limit, 100), "pageNum": 1}
        if symbol:
            params["symbol"] = symbol
        if start_ms:
            params["startTime"] = int(start_ms)
        return params

    # -- mappers ---------------------------------------------------------
    def map_position(self, row: dict) -> dict | None:
        symbol = row.get("symbol") or row.get("instrumentID") or row.get("instrumentId")
        entry = num(row.get("avgPrice")) or num(row.get("openPrice")) or num(row.get("positionPrice"))
        qty = num(row.get("volume")) or num(row.get("positionVolume")) or num(row.get("position"))
        if not symbol or not entry or not qty:
            return None
        leverage = num(row.get("leverage")) or num(row.get("leverageLevel"))
        margin = num(row.get("margin")) or num(row.get("positionMargin")) or num(row.get("occupyMargin"))
        notional = entry * abs(qty)
        if (margin is None or margin <= 0) and leverage:
            margin = notional / leverage
        return {
            "symbol": symbol,
            "side": side_of(row.get("positionSide") or row.get("direction") or row.get("side")),
            "avgPrice": entry,
            "leverage": leverage,
            "margin": margin,
            "positionValue": notional,
            "realizedPnL": num(row.get("closeProfit")) or num(row.get("realizedPnl")) or 0.0,
            "createTime": row.get("openTime") or row.get("createTime") or row.get("ctime"),
        }

    def map_history(self, row: dict) -> dict | None:
        symbol = row.get("symbol") or row.get("instrumentID") or row.get("instrumentId")
        entry = num(row.get("openPrice")) or num(row.get("openAvgPrice")) or num(row.get("avgPrice"))
        if not symbol or not entry:
            return None
        pid = row.get("positionId") or row.get("id") or row.get("orderId")
        qty = num(row.get("closeVolume")) or num(row.get("volume")) or 0.0
        leverage = num(row.get("leverage")) or num(row.get("leverageLevel"))
        return {
            "id": str(pid) if pid is not None else None,
            "symbol": symbol,
            "side": side_of(row.get("positionSide") or row.get("direction") or row.get("side")),
            "openAvgPrice": entry,
            "closeAvgPrice": num(row.get("closePrice")) or num(row.get("closeAvgPrice")),
            "leverage": leverage,
            "closeValue": (qty * entry) if qty else None,
            "maxPosition": qty,
            "realizedPnL": num(row.get("closeProfit")) or num(row.get("profit")) or 0.0,
            "openTime": row.get("openTime") or row.get("createTime"),
            "closeTime": row.get("closeTime") or row.get("updateTime"),
        }

    def map_fill(self, row: dict) -> dict | None:
        price = num(row.get("price")) or num(row.get("tradePrice")) or num(row.get("dealPrice"))
        qty = num(row.get("volume")) or num(row.get("tradeVolume")) or num(row.get("amount"))
        side = order_side_of(row.get("direction") or row.get("side") or row.get("tradeType"))
        ts = row.get("tradeTime") or row.get("time") or row.get("createTime") or row.get("ctime")
        if not price or not qty or not side or ts is None:
            return None
        return {
            "symbol": row.get("symbol") or row.get("instrumentID") or row.get("instrumentId"),
            "price": price,
            "qty": qty,
            "side": side,
            "time": ts,
            "fee": num(row.get("fee")) or 0.0,
            "leverage": num(row.get("leverage")),
        }
