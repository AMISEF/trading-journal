"""Tests for the Toobit fills → journal trade mapping engine."""

from datetime import datetime, timedelta, timezone

from app.services.toobit_import import (
    Fill,
    ToobitFill,
    build_trade_from_fills,
    build_trades_from_toobit_fills,
)

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _t(mins: int) -> datetime:
    return T0 + timedelta(minutes=mins)


def test_open_only_position_is_open_with_weighted_entry():
    # Scaled long entry, nothing closed yet.
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "BUY", 0.090, 100), Fill(_t(1), "BUY", 0.094, 100)],
        leverage=10,
    )
    assert r["direction"] == "LONG"
    assert r["status"] == "OPEN"
    assert r["leverage"] == 10
    assert abs(r["entry_price"] - 0.092) < 1e-9   # (0.090+0.094)/2 weighted equally
    assert r["take_profits"] == []
    assert r["stop_loss"] is None
    assert r["close_date"] is None


def test_partial_close_becomes_target_with_percent():
    # Long 100 @ 0.09; close 30 @ 0.10 (profit) → one TP, 30% saved, still open.
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "BUY", 0.09, 100), Fill(_t(1), "SELL", 0.10, 30)],
    )
    assert r["status"] == "OPEN"
    assert len(r["take_profits"]) == 1
    tp = r["take_profits"][0]
    assert tp["price"] == 0.10 and tp["save_percent"] == 30.0
    assert r["realized_pnl"] > 0


def test_full_loss_close_sets_stop():
    # Long fully closed at a loss → that exit is the stop.
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "BUY", 0.10, 100), Fill(_t(1), "SELL", 0.085, 100)],
    )
    assert r["status"] == "CLOSED"
    assert r["stop_loss"] == 0.085
    assert r["exit_price"] == 0.085
    assert r["take_profits"] == []
    assert r["realized_pnl"] < 0


def test_risk_free_take_profit_then_exit_at_entry():
    # Long @0.09; take profit on 50% @0.095; close remaining 50% back at entry.
    r = build_trade_from_fills(
        "ARB",
        [
            Fill(_t(0), "BUY", 0.09, 100),
            Fill(_t(1), "SELL", 0.095, 50),
            Fill(_t(2), "SELL", 0.09, 50),
        ],
    )
    assert r["status"] == "CLOSED"
    assert r["is_risk_free_mgmt"] is True
    assert len(r["take_profits"]) == 1
    assert r["stop_loss"] is None            # breakeven exit is not a stop
    assert r["realized_pnl"] > 0


def test_short_direction_profit_is_price_going_down():
    # Short @0.10; buy back 100% @0.09 → profit, closed.
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "SELL", 0.10, 100), Fill(_t(1), "BUY", 0.09, 100)],
    )
    assert r["direction"] == "SHORT"
    assert r["status"] == "CLOSED"
    assert r["realized_pnl"] > 0
    assert len(r["take_profits"]) == 1        # the profitable close is a target
    assert r["stop_loss"] is None


def test_short_loss_sets_stop():
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "SELL", 0.09, 100), Fill(_t(1), "BUY", 0.10, 100)],
    )
    assert r["direction"] == "SHORT"
    assert r["stop_loss"] == 0.10
    assert r["realized_pnl"] < 0


def test_planned_targets_and_stop_are_honoured():
    # Exchange exposes the user's own TP/SL; nothing closed yet.
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "BUY", 0.09, 100)],
        planned_targets=[0.10, 0.11],
        planned_stop=0.085,
    )
    assert r["status"] == "OPEN"
    assert {tp["price"] for tp in r["take_profits"]} == {0.10, 0.11}
    assert r["stop_loss"] == 0.085


def test_never_closes_more_than_opened():
    # Defensive: a stray oversized close fill can't drive fraction over 100%.
    r = build_trade_from_fills(
        "ARB",
        [Fill(_t(0), "BUY", 0.09, 100), Fill(_t(1), "SELL", 0.10, 999)],
    )
    assert r["closed_fraction"] == 100.0
    assert r["status"] == "CLOSED"


def test_no_fills_returns_none():
    assert build_trade_from_fills("ARB", []) is None


# --- Toobit grouping (explicit BUY_OPEN/SELL_CLOSE roles) ---------------------
def test_toobit_two_separate_positions_are_split():
    fills = [
        # position 1: long, opened and fully closed in profit
        ToobitFill(_t(0), "BUY_OPEN", 0.09, 100),
        ToobitFill(_t(1), "SELL_CLOSE", 0.10, 100),
        # position 2: short, still open
        ToobitFill(_t(2), "SELL_OPEN", 0.11, 50),
    ]
    trades = build_trades_from_toobit_fills("ARB", fills, leverage=10)
    assert len(trades) == 2
    assert trades[0]["direction"] == "LONG" and trades[0]["status"] == "CLOSED"
    assert trades[1]["direction"] == "SHORT" and trades[1]["status"] == "OPEN"
    # stable, distinct ids per instance
    assert trades[0]["toobit_position_id"] != trades[1]["toobit_position_id"]
    assert all(t["toobit_position_id"].startswith("ARB|") for t in trades)


def test_toobit_partial_then_risk_free_single_position():
    fills = [
        ToobitFill(_t(0), "BUY_OPEN", 0.09, 100),
        ToobitFill(_t(1), "SELL_CLOSE", 0.095, 50),   # take profit on half
        ToobitFill(_t(2), "SELL_CLOSE", 0.09, 50),    # close rest at entry
    ]
    trades = build_trades_from_toobit_fills("ARB", fills, leverage=5)
    assert len(trades) == 1
    t = trades[0]
    assert t["status"] == "CLOSED"
    assert t["is_risk_free_mgmt"] is True
    assert t["leverage"] == 5
    assert len(t["take_profits"]) == 1 and t["take_profits"][0]["save_percent"] == 50.0
