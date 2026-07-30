"""WEEX USDT-M contract adapter (https://www.weex.com/api-doc/contract/intro).

Auth: headers ``ACCESS-KEY``, ``ACCESS-PASSPHRASE``, ``ACCESS-TIMESTAMP`` and
``ACCESS-SIGN``, where::

    ACCESS-SIGN = base64(HMAC_SHA256(secret,
        timestamp + METHOD + requestPath [+ "?" + queryString] + body))

WEEX therefore needs a third credential (the passphrase) on top of the key and
secret — the settings UI asks for it only for this exchange.
"""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlencode

from app.services.exchanges.base import (
    BaseExchangeClient,
    hmac_b64,
    now_ms,
    num,
    order_side_of,
    side_of,
)


class WeexClient(BaseExchangeClient):
    slug = "weex"
    label = "WEEX"
    default_base = "https://api-contract.weex.com"
    needs_passphrase = True

    position_paths = (
        "/capi/v3/account/position/allPosition",
        "/capi/v2/account/position/allPosition",
    )
    history_paths = (
        "/capi/v3/account/position/historyPosition",
        "/capi/v3/account/position/history",
        "/capi/v2/account/position/historyPosition",
    )
    fills_paths = (
        "/capi/v3/trade/fills",
        "/capi/v3/order/fills",
        "/capi/v2/order/fills",
    )

    def _prepare(self, method: str, path: str, params: dict[str, Any] | None, body: dict | None):
        ts = str(now_ms())
        query = urlencode(sorted(params.items())) if params else ""
        raw_body = ""
        content = None
        if method != "GET" and body is not None:
            raw_body = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
            content = raw_body
        prehash = ts + method + path + (f"?{query}" if query else "") + raw_body
        headers = {
            "ACCESS-KEY": self.api_key,
            "ACCESS-SIGN": hmac_b64(self.secret_key, prehash),
            "ACCESS-TIMESTAMP": ts,
            "Content-Type": "application/json",
        }
        if self.passphrase:
            headers["ACCESS-PASSPHRASE"] = self.passphrase
        url = f"{self.base_url}{path}" + (f"?{query}" if query else "")
        return url, headers, content

    # -- params ----------------------------------------------------------
    def history_params(self, start_ms: int | None, limit: int) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": min(limit, 100), "pageSize": min(limit, 100)}
        if start_ms:
            params["startTime"] = int(start_ms)
        return params

    def fills_params(self, symbol: str | None, start_ms: int | None, limit: int) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": min(limit, 500)}
        if symbol:
            params["symbol"] = symbol
        if start_ms:
            params["startTime"] = int(start_ms)
        return params

    # -- mappers ---------------------------------------------------------
    def map_position(self, row: dict) -> dict | None:
        symbol = row.get("symbol")
        entry = num(row.get("avgPrice")) or num(row.get("entryPrice")) or num(row.get("openAvgPrice"))
        size = num(row.get("positionAmt")) or num(row.get("available")) or num(row.get("total"))
        if not symbol or not entry or not size:
            return None
        leverage = num(row.get("leverage"))
        margin = num(row.get("margin")) or num(row.get("isolatedMargin")) or num(row.get("initialMargin"))
        notional = num(row.get("notional")) or entry * abs(size)
        if (margin is None or margin <= 0) and leverage:
            margin = notional / leverage
        return {
            "symbol": symbol,
            "side": side_of(row.get("positionSide") or row.get("holdSide") or row.get("side")),
            "avgPrice": entry,
            "leverage": leverage,
            "margin": margin,
            "positionValue": notional,
            "realizedPnL": num(row.get("realizedPnl")) or num(row.get("realizedProfit")) or 0.0,
            "createTime": row.get("createTime") or row.get("cTime") or row.get("openTime"),
        }

    def map_history(self, row: dict) -> dict | None:
        symbol = row.get("symbol")
        entry = num(row.get("openAvgPrice")) or num(row.get("avgEntryPrice")) or num(row.get("openPrice"))
        if not symbol or not entry:
            return None
        pid = row.get("positionId") or row.get("id") or row.get("orderId")
        leverage = num(row.get("leverage"))
        qty = num(row.get("closeVolume")) or num(row.get("volume")) or num(row.get("maxPosition")) or 0.0
        close_value = num(row.get("closeValue")) or (qty * entry if qty else None)
        return {
            "id": str(pid) if pid is not None else None,
            "symbol": symbol,
            "side": side_of(row.get("positionSide") or row.get("holdSide") or row.get("side")),
            "openAvgPrice": entry,
            "closeAvgPrice": num(row.get("closeAvgPrice")) or num(row.get("closePrice")),
            "leverage": leverage,
            "closeValue": close_value,
            "maxPosition": qty,
            "realizedPnL": num(row.get("realizedPnl")) or num(row.get("profit")) or 0.0,
            "openTime": row.get("openTime") or row.get("cTime"),
            "closeTime": row.get("closeTime") or row.get("uTime") or row.get("updateTime"),
        }

    def map_fill(self, row: dict) -> dict | None:
        price = num(row.get("price")) or num(row.get("fillPrice")) or num(row.get("avgPrice"))
        qty = num(row.get("qty")) or num(row.get("fillQty")) or num(row.get("size")) or num(row.get("executedQty"))
        side = order_side_of(row.get("side") or row.get("orderSide") or row.get("type"))
        ts = row.get("time") or row.get("cTime") or row.get("createTime") or row.get("fillTime")
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
