"""Dashboard analytics computed from the user's CLOSED trades."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import balances, calc as calc_engine, dashboard_stats, tabdeal
from app.services.balances import _txn_sum
from app.services.sessions import session_for

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/rr-debug")
async def rr_debug(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Debug: shows why rrAchieved is None for each closed trade."""
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    closed = [t for t in trades if t.status == "CLOSED"]
    closed.sort(key=lambda t: t.number)
    balance = (user.wallet_margin or 0.0) + _txn_sum(transactions)
    rows = []
    for t in closed:
        tp_dicts = [
            {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
            for tp in t.take_profits
        ]
        base = t.balance_snapshot if t.balance_snapshot is not None else balance
        result = calc_engine.compute(
            direction=t.direction,
            entry=t.entry_price,
            leverage=t.leverage,
            margin_percent=t.margin_percent,
            wallet_balance_now=base,
            stop_loss=t.stop_loss,
            take_profits=tp_dicts,
            exit_type=t.exit_type,
            trail_value=t.trail_exit_value,
            trail_is_percent=bool(t.trail_is_percent),
            exit_price=t.exit_price,
        )
        balance += result["realizedPnl"]
        rows.append({
            "number": t.number,
            "symbol": t.symbol,
            "entry": t.entry_price,
            "stop_loss": t.stop_loss,
            "exit_type": t.exit_type,
            "exit_price": t.exit_price,
            "leverage": t.leverage,
            "margin_percent": t.margin_percent,
            "tp_count": len(tp_dicts),
            "rr_achieved": result.get("rrAchieved"),
            "why_none": (
                "no entry" if not t.entry_price else
                "no stop_loss" if t.stop_loss is None else
                "entry == stop_loss" if abs((t.entry_price or 0) - (t.stop_loss or 0)) < 1e-12 else
                "no exit" if result.get("rrAchieved") == 0 and not t.exit_price and not t.exit_type else
                "ok"
            ),
        })
    return rows


class DashboardOut(CamelModel):
    trade_count: int
    closed_count: int
    profit_factor: float | None
    avg_rr: float | None
    avg_leverage: float | None = None
    avg_leverage_long: float | None = None
    avg_leverage_short: float | None = None
    win_rate: float | None
    current_balance: float
    equity_curve: list[dict]
    pnl_by_day: list[dict]
    direction_stats: dict
    session_stats: list[dict]
    win_loss: dict
    top_symbols: list[dict]
    checklist_discipline: float | None
    usdt_irt: float | None
    # --- extra analytics (drawdown, streaks, worst symbols) ---
    worst_symbols: list[dict] = []
    max_drawdown: dict | None = None
    win_streak: dict | None = None
    loss_streak: dict | None = None


@router.get("/", response_model=DashboardOut)
@router.get("", response_model=DashboardOut, include_in_schema=False)
async def dashboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardOut:
    return await build_user_dashboard(db, user)


async def build_user_dashboard(db: AsyncSession, user: User) -> DashboardOut:
    """Compute one user's full dashboard. Shared by the authenticated endpoint
    and the public demo endpoint (which renders a showcase account read-only)."""
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    unlocked = [t for t in trades if not getattr(t, "is_locked", False)]
    closed = [t for t in unlocked if t.status == "CLOSED"]
    closed.sort(key=lambda t: t.number)

    trade_count = len(unlocked)
    closed_count = len(closed)

    # Average leverage across all of the user's (unlocked) trades that set one,
    # plus a long/short breakdown.
    def _avg_lev(rows) -> float | None:
        vals = [
            float(t.leverage) for t in rows
            if t.leverage is not None and float(t.leverage) > 0
        ]
        return (sum(vals) / len(vals)) if vals else None

    avg_leverage = _avg_lev(unlocked)
    avg_leverage_long = _avg_lev([t for t in unlocked if t.direction == "LONG"])
    avg_leverage_short = _avg_lev([t for t in unlocked if t.direction == "SHORT"])

    # --- Running equity curve + per-trade PnL + RR (using the same balance logic) ---
    balance = (user.wallet_margin or 0.0) + _txn_sum(transactions)
    start_balance = balance
    equity_curve: list[dict] = []
    pnls: list[float] = []
    rr_values: list[float] = []
    for t in closed:
        tp_dicts = [
            {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
            for tp in t.take_profits
        ]
        # Margin is derived from the trade's fixed balance snapshot when present.
        base = t.balance_snapshot if t.balance_snapshot is not None else balance
        result = calc_engine.compute(
            direction=t.direction,
            entry=t.entry_price,
            leverage=t.leverage,
            margin_percent=t.margin_percent,
            wallet_balance_now=base,
            stop_loss=t.stop_loss,
            take_profits=tp_dicts,
            exit_type=t.exit_type,
            trail_value=t.trail_exit_value,
            trail_is_percent=bool(t.trail_is_percent),
            exit_price=t.exit_price,
        )
        pnl = result["realizedPnl"]
        rr = result.get("rrAchieved")
        # Toobit trades carry their own margin-based achieved-R (no exchange stop).
        if getattr(t, "source", None) == "toobit" and t.rr_achieved is not None:
            rr = t.rr_achieved
        if rr is not None:
            rr_values.append(rr)
        balance += pnl
        pnls.append(pnl)
        _d = t.close_date or t.open_date
        equity_curve.append({
            "number": t.number,
            "balance": balance,
            "pnl": pnl,
            "date": _d.date().isoformat() if _d else None,
        })

    current_balance = balance

    # --- Profit factor = gross profit / gross loss ---
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(-p for p in pnls if p < 0)
    if gross_loss > 0:
        profit_factor = gross_profit / gross_loss
    elif gross_profit > 0:
        profit_factor = None  # no losses at all -> "infinite"; report None
    else:
        profit_factor = None

    # --- Average RR achieved (computed on-the-fly via calc engine) ---
    avg_rr = (sum(rr_values) / len(rr_values)) if rr_values else None

    # --- Win / loss distribution ---
    win_pnls = [p for p in pnls if p > 0]
    loss_pnls = [p for p in pnls if p < 0]
    breakeven_count = sum(1 for p in pnls if p == 0)
    wins = len(win_pnls)
    win_rate = (wins / closed_count) if closed_count else None
    avg_win = (sum(win_pnls) / len(win_pnls)) if win_pnls else None
    avg_loss = (sum(loss_pnls) / len(loss_pnls)) if loss_pnls else None
    win_loss = {
        "win": wins,
        "loss": len(loss_pnls),
        "breakeven": breakeven_count,
        "avgWin": avg_win,
        "avgLoss": avg_loss,
    }

    # --- PnL by day (close date) ---
    by_day: dict[str, float] = defaultdict(float)
    for t, pnl in zip(closed, pnls):
        day = (t.close_date or t.open_date)
        key = day.date().isoformat() if day else "unknown"
        by_day[key] += pnl
    pnl_by_day = [{"date": d, "pnl": v} for d, v in sorted(by_day.items())]

    # --- Extra analytics: drawdown, streaks, direction win rates, best/worst symbols ---
    extra = dashboard_stats.compute_extra(closed, pnls, start_balance)
    direction_stats = extra["direction_stats"]

    # --- Session stats ---
    sess_count: dict[str, int] = defaultdict(int)
    sess_pnl: dict[str, float] = defaultdict(float)
    for t, pnl in zip(closed, pnls):
        s = session_for(t.open_date) or "Unknown"
        sess_count[s] += 1
        sess_pnl[s] += pnl
    session_stats = [
        {"session": s, "count": sess_count[s], "pnl": sess_pnl[s]}
        for s in sess_count
    ]

    # --- Top / worst symbols by PnL (with win rate) ---
    top_symbols = extra["top_symbols"]

    # --- Checklist discipline: avg fraction of items ticked across closed trades ---
    fractions: list[float] = []
    for t in closed:
        ticks = t.checklist_ticks or {}
        if isinstance(ticks, dict) and ticks:
            total = len(ticks)
            done = sum(1 for v in ticks.values() if v)
            if total:
                fractions.append(done / total)
    checklist_discipline = (sum(fractions) / len(fractions)) if fractions else None

    # --- USDT/IRT rate (best effort) ---
    irt = await tabdeal.get_usdt_irt()

    return DashboardOut(
        trade_count=trade_count,
        closed_count=closed_count,
        profit_factor=profit_factor,
        avg_rr=avg_rr,
        avg_leverage=avg_leverage,
        avg_leverage_long=avg_leverage_long,
        avg_leverage_short=avg_leverage_short,
        win_rate=win_rate,
        current_balance=current_balance,
        equity_curve=equity_curve,
        pnl_by_day=pnl_by_day,
        direction_stats=direction_stats,
        session_stats=session_stats,
        win_loss=win_loss,
        top_symbols=top_symbols,
        checklist_discipline=checklist_discipline,
        usdt_irt=irt.get("rate"),
        worst_symbols=extra["worst_symbols"],
        max_drawdown=extra["max_drawdown"],
        win_streak=extra["win_streak"],
        loss_streak=extra["loss_streak"],
    )
