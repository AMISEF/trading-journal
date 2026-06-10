"""Unit tests for the calc engine (app/services/calc.py).

Expected numbers are hand-computed from SPEC section 7. No commission/funding.
"""

import pytest

from app.services.calc import compute


def test_long_two_tps_chained():
    """LONG with two TPs and chained save percentages, LAST_TP exit.

    wallet=1000, mp=10% -> margin=100, lev=10 -> position=1000.
    entry=100, sl=90 -> risk_1r = 100 * |100-90|/100 * 10 = 100.
    full$(110) = 100 * ((110-100)/100*10) = 100.
    full$(120) = 100 * ((120-100)/100*10) = 200.
    TP1 save 50%: closed 0.5 -> 100*0.5 = 50; remaining 0.5.
    TP2 save 100%: closed 0.5 -> 200*0.5 = 100; remaining 0. total = 150.
    rr_expected = 200/100 = 2.0 ; rr_achieved = 150/100 = 1.5.
    """
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[
            {"order": 1, "price": 110, "save_percent": 50},
            {"order": 2, "price": 120, "save_percent": 100},
        ],
        exit_type="LAST_TP",
    )
    assert r["margin"] == pytest.approx(100)
    assert r["positionSize"] == pytest.approx(1000)
    assert r["risk1r"] == pytest.approx(100)
    assert r["realizedPnl"] == pytest.approx(150)
    assert r["rrExpected"] == pytest.approx(2.0)
    assert r["rrAchieved"] == pytest.approx(1.5)
    assert r["resultPct"] == pytest.approx(150)  # 150/100*100

    # per-TP checks
    tp1, tp2 = r["perTp"]
    assert tp1["fullDollar"] == pytest.approx(100)
    assert tp1["savedDollar"] == pytest.approx(50)
    assert tp1["rrDynamic"] == pytest.approx(0.5)
    assert tp2["fullDollar"] == pytest.approx(200)
    assert tp2["savedDollar"] == pytest.approx(100)
    assert tp2["rrDynamic"] == pytest.approx(1.5)


def test_short_trade():
    """SHORT with one TP, LAST_TP exit.

    sign=-1. entry=100, sl=110 -> risk_1r = 100*10/100*10 = 100.
    full$(90) = 100 * (-1*(90-100)/100*10) = 100 * (1.0) = 100.
    TP1 price 90 save 50%: 100*0.5 = 50; remaining 0.5.
    LAST_TP adds full$(90)*0.5 = 50. total = 100.
    rr_expected = 100/100 = 1.0 ; rr_achieved = 100/100 = 1.0.
    """
    r = compute(
        direction="SHORT",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=110,
        take_profits=[{"order": 1, "price": 90, "save_percent": 50}],
        exit_type="LAST_TP",
    )
    assert r["margin"] == pytest.approx(100)
    assert r["risk1r"] == pytest.approx(100)
    assert r["realizedPnl"] == pytest.approx(100)
    assert r["rrExpected"] == pytest.approx(1.0)
    assert r["rrAchieved"] == pytest.approx(1.0)


def test_stop_loss_exit_negative_pnl():
    """LONG that hits stop loss -> negative PnL of exactly -risk_1r on full size.

    entry=100, sl=90, lev=10, margin=100 -> risk_1r=100.
    No TP saved. STOP_LOSS exit on remaining 1.0:
    full$(90) = 100 * ((90-100)/100*10) = -100. realized = -100.
    rr_achieved = -100/100 = -1.0.
    """
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[{"order": 1, "price": 120, "save_percent": 0}],
        exit_type="STOP_LOSS",
    )
    assert r["realizedPnl"] == pytest.approx(-100)
    assert r["rrAchieved"] == pytest.approx(-1.0)
    # expected RR still uses the last TP (120): full$(120)=200 -> 200/100 = 2.0
    assert r["rrExpected"] == pytest.approx(2.0)


def test_risk_free_exit_remaining_zero():
    """RISK_FREE exit: remaining fraction contributes 0.

    TP1 save 50% at 110 -> realized 50. RISK_FREE adds 0 for remaining 0.5.
    realized = 50. rr_achieved = 50/100 = 0.5.
    """
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[{"order": 1, "price": 110, "save_percent": 50}],
        exit_type="RISK_FREE",
    )
    assert r["realizedPnl"] == pytest.approx(50)
    assert r["rrAchieved"] == pytest.approx(0.5)


def test_trailing_stop_percent():
    """TRAILING_STOP with a percentage value (LONG).

    No TP saved (remaining 1.0). trail_value=15% -> P = 100*(1+0.15)=115.
    full$(115) = 100 * ((115-100)/100*10) = 150. realized = 150.
    rr_achieved = 150/100 = 1.5.
    """
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[{"order": 1, "price": 200, "save_percent": 0}],
        exit_type="TRAILING_STOP",
        trail_value=15,
        trail_is_percent=True,
    )
    assert r["realizedPnl"] == pytest.approx(150)
    assert r["rrAchieved"] == pytest.approx(1.5)


def test_trailing_stop_absolute():
    """TRAILING_STOP with an absolute exit price (LONG).

    trail_value=130 (absolute price). full$(130) = 100*((130-100)/100*10)=300.
    remaining 1.0 -> realized = 300. rr_achieved = 300/100 = 3.0.
    """
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[{"order": 1, "price": 200, "save_percent": 0}],
        exit_type="TRAILING_STOP",
        trail_value=130,
        trail_is_percent=False,
    )
    assert r["realizedPnl"] == pytest.approx(300)
    assert r["rrAchieved"] == pytest.approx(3.0)


def test_exit_price_closes_remainder_at_specific_tp():
    """Saved across TP1..TP4 but the remainder is closed back at the TP2 price.

    wallet=1000, mp=10% -> margin=100, lev=10. entry=100, sl=90 -> risk_1r=100.
    TPs at 110/120/130/140, each saving 50% of the *remaining* position:
      TP1 (110): full$=100, closed 0.50 -> 50.0; remaining 0.50
      TP2 (120): full$=200, closed 0.25 -> 50.0; remaining 0.25
      TP3 (130): full$=300, closed 0.125 -> 37.5; remaining 0.125
      TP4 (140): full$=400, closed 0.0625 -> 25.0; remaining 0.0625
    Saved subtotal = 162.5.
    The leftover 0.0625 exits at the TP2 price (120): full$(120)=200 -> 12.5.
    Total realized = 175.0.
    """
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[
            {"order": 1, "price": 110, "save_percent": 50},
            {"order": 2, "price": 120, "save_percent": 50},
            {"order": 3, "price": 130, "save_percent": 50},
            {"order": 4, "price": 140, "save_percent": 50},
        ],
        exit_type="LAST_TP",
        exit_price=120,  # remainder pinned to the TP2 level
    )
    assert r["realizedPnl"] == pytest.approx(175.0)


def test_risk_free_remainder_is_breakeven():
    """Save 50% at TP1, then go risk-free: the rest exits at entry for 0 PnL."""
    r = compute(
        direction="LONG",
        entry=100,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=90,
        take_profits=[{"order": 1, "price": 110, "save_percent": 50}],
        exit_type="RISK_FREE",
    )
    # TP1: full$(110)=100, closed 0.5 -> 50; remaining 0.5 exits at entry -> 0.
    assert r["realizedPnl"] == pytest.approx(50.0)


def test_zero_entry_is_safe():
    """Guard: entry=0 must not raise; rr fields fall back to None / 0."""
    r = compute(
        direction="LONG",
        entry=0,
        leverage=10,
        margin_percent=10,
        wallet_balance_now=1000,
        stop_loss=0,
        take_profits=[{"order": 1, "price": 110, "save_percent": 50}],
        exit_type="LAST_TP",
    )
    assert r["risk1r"] == pytest.approx(0)
    assert r["rrExpected"] is None
    assert r["rrAchieved"] is None
    assert r["realizedPnl"] == pytest.approx(0)
