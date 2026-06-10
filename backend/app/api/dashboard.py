"""Dashboard analytics computed from the user's CLOSED trades."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import balances, calc as calc_engine, tabdeal
from app.services.balances import _txn_sum
from app.services.sessions import session_for

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class DashboardOut(CamelModel):
    trade_count: int
    closed_count: int
    profit_factor: float | None
    avg_rr: float | None
    win_rate: float | None
    current_balance: float
    equity_curve: list[dict]
    pnl_by_day: list[dict]
    direction_stats: dict
    session_stats: list[dict]
    top_symbols: list[dict]
    checklist_discipline: float | None
    usdt_irt: float | None


@router.get("/", response_model=DashboardOut)
@router.get("", response_model=DashboardOut, include_in_schema=False)
async def dashboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardOut:
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    closed = [t for t in trades if t.status == "CLOSED"]
    closed.sort(key=lambda t: t.number)

    trade_count = len(trades)
    closed_count = len(closed)

    # --- Running equity curve + per-trade PnL + RR (using the same balance logic) ---
    balance = (user.wallet_margin or 0.0) + _txn_sum(transactions)
    equity_curve: list[dict] = []
    pnls: list[float] = []
    rr_values: list[float] = []
    for t in closed:
        tp_dicts = [
            {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
            for tp in t.take_profits
        ]
        result = calc_engine.compute(
            direction=t.direction,
            entry=t.entry_price,
            leverage=t.leverage,
            margin_percent=t.margin_percent,
            wallet_balance_now=balance,
            stop_loss=t.stop_loss,
            take_profits=tp_dicts,
            exit_type=t.exit_type,
            trail_value=t.trail_exit_value,
            trail_is_percent=bool(t.trail_is_percent),
            exit_price=t.exit_price,
        )
        pnl = result["realizedPnl"]
        rr = result.get("rrAchieved")
        if rr is not None:
            rr_values.append(rr)
        balance += pnl
        pnls.append(pnl)
        equity_curve.append({"number": t.number, "balance": balance})

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

    # --- Win rate ---
    wins = sum(1 for p in pnls if p > 0)
    win_rate = (wins / closed_count) if closed_count else None

    # --- PnL by day (close date) ---
    by_day: dict[str, float] = defaultdict(float)
    for t, pnl in zip(closed, pnls):
        day = (t.close_date or t.open_date)
        key = day.date().isoformat() if day else "unknown"
        by_day[key] += pnl
    pnl_by_day = [{"date": d, "pnl": v} for d, v in sorted(by_day.items())]

    # --- Direction stats ---
    direction_stats = {
        "long": sum(1 for t in closed if t.direction == "LONG"),
        "short": sum(1 for t in closed if t.direction == "SHORT"),
    }

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

    # --- Top symbols by PnL ---
    sym_pnl: dict[str, float] = defaultdict(float)
    sym_count: dict[str, int] = defaultdict(int)
    for t, pnl in zip(closed, pnls):
        sym = t.symbol or "?"
        sym_pnl[sym] += pnl
        sym_count[sym] += 1
    top_symbols = sorted(
        ({"symbol": s, "pnl": sym_pnl[s], "count": sym_count[s]} for s in sym_pnl),
        key=lambda x: x["pnl"],
        reverse=True,
    )[:5]

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
        win_rate=win_rate,
        current_balance=current_balance,
        equity_curve=equity_curve,
        pnl_by_day=pnl_by_day,
        direction_stats=direction_stats,
        session_stats=session_stats,
        top_symbols=top_symbols,
        checklist_discipline=checklist_discipline,
        usdt_irt=irt.get("rate"),
    )
