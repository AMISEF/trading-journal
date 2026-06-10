"""The trading calculation engine.

This is the single most important file in the backend. It turns the numbers a
trader enters (entry price, leverage, stop loss, take-profit targets, ...) into
the money/risk figures shown all over the app.

It is implemented EXACTLY per SPEC section 7. Important rules:
  * No commission and no funding are ever applied.
  * Only closed trades affect the wallet balance (handled by the caller, which
    passes in ``wallet_balance_now``).
  * Everything here is a pure function (no database, no network), which makes it
    easy to test and reuse.

Public entry point: ``compute(...)`` returns the ``calc`` dict used by the API.
"""

from __future__ import annotations

from typing import Any


def _to_float(value: Any) -> float | None:
    """Best-effort conversion to float. Returns None if not convertible."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compute(
    direction: str | None,
    entry: float | None,
    leverage: float | None,
    margin_percent: float | None,
    wallet_balance_now: float | None,
    stop_loss: float | None = None,
    take_profits: list[dict] | None = None,
    exit_type: str | None = None,
    trail_value: float | None = None,
    trail_is_percent: bool = False,
    exit_price: float | None = None,
    session: str | None = None,
) -> dict:
    """Compute the full ``calc`` object for a trade or a preview.

    Parameters mirror SPEC section 7. Every numeric input is treated defensively
    so that an incomplete (half-filled) trade never crashes the app — missing
    values simply make the dependent results 0 or None.

    take_profits items look like ``{"order": 1, "price": 123.0, "savePercent": 50}``.
    (Either ``savePercent`` or ``save_percent`` keys are accepted.)
    """
    # --- Normalise inputs -------------------------------------------------
    direction = (direction or "LONG").upper()
    sign = 1.0 if direction == "LONG" else -1.0

    entry = _to_float(entry)
    leverage = _to_float(leverage) or 0.0
    margin_percent = _to_float(margin_percent) or 0.0
    wallet_balance_now = _to_float(wallet_balance_now) or 0.0
    stop_loss = _to_float(stop_loss)
    trail_value = _to_float(trail_value)
    exit_price = _to_float(exit_price)

    # Sort take-profits by their order and normalise the dict keys.
    tps_raw = take_profits or []
    norm_tps: list[dict] = []
    for tp in tps_raw:
        price = _to_float(tp.get("price"))
        save_percent = _to_float(
            tp.get("savePercent", tp.get("save_percent", 0)) or 0
        ) or 0.0
        order = tp.get("order")
        try:
            order = int(order) if order is not None else 0
        except (TypeError, ValueError):
            order = 0
        norm_tps.append({"order": order, "price": price, "save_percent": save_percent})
    norm_tps.sort(key=lambda t: t["order"])

    # --- Base money figures ----------------------------------------------
    margin = wallet_balance_now * margin_percent / 100.0
    position_size = margin * leverage

    # Helper closures (need ``entry`` to be valid and non-zero).
    def leveraged_return(price: float | None) -> float:
        if price is None or not entry:
            return 0.0
        return sign * (price - entry) / entry * leverage

    def spot_growth_pct(price: float | None) -> float:
        if price is None or not entry:
            return 0.0
        return sign * (price - entry) / entry * 100.0

    def leveraged_pct(price: float | None) -> float:
        return leveraged_return(price) * 100.0

    def full_dollar_at(price: float | None) -> float:
        return margin * leveraged_return(price)

    # --- Risk per 1R ------------------------------------------------------
    if entry and stop_loss is not None:
        risk_1r = margin * abs(entry - stop_loss) / entry * leverage
    else:
        risk_1r = 0.0

    # --- Walk the take-profits, building per-TP display + realized total ---
    remaining = 1.0
    realized_total = 0.0
    cumulative_realized = 0.0
    per_tp: list[dict] = []

    for tp in norm_tps:
        price = tp["price"]
        save_percent = tp["save_percent"]

        # Fraction of the position closed at this TP and the resulting money.
        remaining_before = remaining
        closed = remaining_before * (save_percent / 100.0)
        full_dollar = full_dollar_at(price)
        saved_dollar = full_dollar * closed

        realized_total += saved_dollar
        cumulative_realized += saved_dollar
        remaining *= 1 - save_percent / 100.0

        rr_dynamic = (cumulative_realized / risk_1r) if risk_1r else None

        per_tp.append(
            {
                "order": tp["order"],
                "price": price,
                "savePercent": save_percent,
                "spotPct": spot_growth_pct(price),
                "levPct": leveraged_pct(price),
                "fullDollar": full_dollar,
                "savedDollar": saved_dollar,
                "rrDynamic": rr_dynamic,
            }
        )

    # Highest-order TP price is used for the "expected" RR and LAST_TP exit.
    last_tp_price = norm_tps[-1]["price"] if norm_tps else None

    # --- Apply the chosen exit to whatever fraction is still open ---------
    # ``exit_price`` (when provided) is the single source of truth for where the
    # remaining position is closed. This is what lets a trader exit the leftover
    # at ANY specific level — e.g. "I saved at TP1..TP4 but the rest got closed
    # back at the TP2 price". When it is not given we fall back to deriving the
    # exit level from ``exit_type`` (the original, simpler behaviour).
    exit_type = (exit_type or "").upper() or None

    resolved_exit_price: float | None = None
    if exit_price is not None:
        resolved_exit_price = exit_price
    elif exit_type == "LAST_TP":
        resolved_exit_price = last_tp_price
    elif exit_type == "STOP_LOSS":
        resolved_exit_price = stop_loss
    elif exit_type == "RISK_FREE":
        # Risk-free => the remaining position is closed back at the entry, so it
        # contributes exactly zero PnL (full_dollar_at(entry) == 0).
        resolved_exit_price = entry
    elif exit_type == "TRAILING_STOP":
        if trail_is_percent:
            # trail_value is a percentage move from entry, in the trade's favour.
            if entry is not None and trail_value is not None:
                resolved_exit_price = entry * (1 + sign * trail_value / 100.0)
        else:
            # trail_value is an absolute exit price.
            resolved_exit_price = trail_value

    # Only book the remaining fraction once we actually know where it exits.
    if (exit_type is not None or exit_price is not None) and resolved_exit_price is not None:
        realized_total += full_dollar_at(resolved_exit_price) * remaining

    realized_pnl = realized_total

    # --- Risk/reward and result percent ----------------------------------
    rr_expected = (full_dollar_at(last_tp_price) / risk_1r) if risk_1r else None
    rr_achieved = (realized_total / risk_1r) if risk_1r else None
    result_pct = (realized_pnl / margin * 100.0) if margin else 0.0

    return {
        "margin": margin,
        "positionSize": position_size,
        "risk1r": risk_1r,
        "rrExpected": rr_expected,
        "rrAchieved": rr_achieved,
        "realizedPnl": realized_pnl,
        "resultPct": result_pct,
        "session": session,
        "perTp": per_tp,
    }
