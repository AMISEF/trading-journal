"""Tests for the Toobit client signing and the sync fill-parser (no network)."""

import hashlib
import hmac
from datetime import timezone

from app.services.toobit_client import ToobitClient
from app.services.toobit_sync import _parse_fills


def test_sign_is_hmac_sha256_hex_of_the_exact_string():
    c = ToobitClient("key", "mysecret")
    payload = "symbol=BTC-SWAP-USDT&timestamp=1668481902307&recvWindow=5000"
    expected = hmac.new(b"mysecret", payload.encode(), hashlib.sha256).hexdigest()
    assert c._sign(payload) == expected
    assert len(c._sign(payload)) == 64  # sha256 hex


def test_parse_fills_groups_by_symbol_and_normalises_side():
    rows = [
        {"time": "1668425281370", "symbol": "ARB-SWAP-USDT", "price": "0.09",
         "qty": "100", "side": "BUY_OPEN"},
        {"time": "1668425289999", "symbol": "ARB-SWAP-USDT", "price": "0.10",
         "qty": "100", "side": "SELL_CLOSE"},
        {"time": "1668425299999", "symbol": "BTC-SWAP-USDT", "price": "24000",
         "qty": "1", "side": "SELL_OPEN"},
    ]
    grouped = _parse_fills(rows)
    assert set(grouped) == {"ARB-SWAP-USDT", "BTC-SWAP-USDT"}
    arb = grouped["ARB-SWAP-USDT"]
    assert len(arb) == 2
    assert arb[0].is_open is True and arb[0].plain_side == "BUY"
    assert arb[1].is_open is False and arb[1].plain_side == "SELL"
    assert arb[0].ts.tzinfo == timezone.utc


def test_parse_fills_skips_malformed_rows():
    rows = [
        {"time": "x", "symbol": "ARB-SWAP-USDT", "price": "0.09", "qty": "1", "side": "BUY_OPEN"},
        {"symbol": "ARB-SWAP-USDT", "price": "0.09", "qty": "1", "side": "BUY_OPEN"},  # no time
        {"time": "1668425281370", "symbol": "ARB-SWAP-USDT", "price": None, "qty": "1", "side": "BUY_OPEN"},
    ]
    assert _parse_fills(rows) == {}
