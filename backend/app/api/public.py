"""Public (no-auth) endpoints that power the landing-page "لایو معاملات ربات الگو
اسمارت" showcase.

They surface a *combined* view of every member tagged into the Cryptosmart Team
group ("CRYPTOSMART_TEAM"): one merged journal list, one aggregated dashboard
(the per-trader dashboard options summed across members), and the cached AI
analyses so visitors can see how the AI coach reasons.

All of this is read-only and intentionally public — it never exposes emails,
API keys, or anything an authenticated user endpoint wouldn't.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.dashboard import DashboardOut
from app.api.serializers import trade_to_out
from app.core.deps import get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.schemas.trade import TradeOut
from app.services import calc as calc_engine, tabdeal
from app.services.balances import _txn_sum
from app.services.sessions import session_for

router = APIRouter(prefix="/api/public", tags=["public"])

# The group tag assigned via the admin panel (see admin.set_user_group).
TEAM_GROUP = "CRYPTOSMART_TEAM"


def _display_name(u: User) -> str:
    name = " ".join(p for p in [u.first_name, u.last_name] if p).strip()
    return name or u.username


async def _team_members(db: AsyncSession) -> list[User]:
    result = await db.execute(
        select(User).where(User.user_group == TEAM_GROUP).order_by(User.id)
    )
    return list(result.scalars().all())


def _pnl_of(trade, base_balance: float) -> tuple[float, float | None]:
    """Return (realizedPnl, rrAchieved) for a closed trade, mirroring the
    dashboard computation. Prefers the exchange's exact PnL for imported trades."""
    tp_dicts = [
        {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
        for tp in trade.take_profits
    ]
    base = trade.balance_snapshot if trade.balance_snapshot is not None else base_balance
    result = calc_engine.compute(
        direction=trade.direction,
        entry=trade.entry_price,
        leverage=trade.leverage,
        margin_percent=trade.margin_percent,
        wallet_balance_now=base,
        stop_loss=trade.stop_loss,
        take_profits=tp_dicts,
        exit_type=trade.exit_type,
        trail_value=trade.trail_exit_value,
        trail_is_percent=bool(trade.trail_is_percent),
        exit_price=trade.exit_price,
    )
    pnl = result["realizedPnl"]
    # Imported Toobit trades carry the exchange's exact realized PnL.
    if getattr(trade, "source", None) == "toobit" and trade.realized_pnl is not None:
        pnl = trade.realized_pnl
    return pnl, result.get("rrAchieved")


# ── schemas ──────────────────────────────────────────────────────────────────
class PublicTeamTrade(CamelModel):
    trader: str
    username: str
    trade: TradeOut


class PublicMemberAI(CamelModel):
    trader: str
    username: str
    overall: str | None = None
    overall_at: datetime | None = None
    report: str | None = None
    report_at: datetime | None = None


class TeamMember(CamelModel):
    trader: str
    username: str


# ── members ──────────────────────────────────────────────────────────────────
@router.get("/team/members", response_model=list[TeamMember])
async def team_members(db: AsyncSession = Depends(get_db)) -> list[TeamMember]:
    members = await _team_members(db)
    return [TeamMember(trader=_display_name(u), username=u.username) for u in members]


# ── combined journal list ────────────────────────────────────────────────────
@router.get("/team/trades", response_model=list[PublicTeamTrade])
async def team_trades(db: AsyncSession = Depends(get_db)) -> list[PublicTeamTrade]:
    members = await _team_members(db)
    out: list[PublicTeamTrade] = []
    for u in members:
        trades = await crud.load_user_trades(db, u.id)
        transactions = await crud.load_user_transactions(db, u.id)
        for t in trades:
            if getattr(t, "is_locked", False):
                continue
            out.append(
                PublicTeamTrade(
                    trader=_display_name(u),
                    username=u.username,
                    trade=trade_to_out(u, trades, t, transactions),
                )
            )
    # Newest first (by open date, then close date), undated last.
    out.sort(
        key=lambda x: (
            x.trade.open_date or datetime.min,
            x.trade.close_date or datetime.min,
        ),
        reverse=True,
    )
    return out


# ── aggregated dashboard (sum of the per-trader dashboards) ───────────────────
@router.get("/team/dashboard", response_model=DashboardOut)
async def team_dashboard(db: AsyncSession = Depends(get_db)) -> DashboardOut:
    members = await _team_members(db)

    start_balance = 0.0
    trade_count = 0
    closed_count = 0
    # (trade, pnl) pairs across every member, plus the rr list.
    closed_pairs: list[tuple[object, float]] = []
    rr_values: list[float] = []
    fractions: list[float] = []

    for u in members:
        trades = await crud.load_user_trades(db, u.id)
        transactions = await crud.load_user_transactions(db, u.id)
        unlocked = [t for t in trades if not getattr(t, "is_locked", False)]
        closed = [t for t in unlocked if t.status == "CLOSED"]
        base_balance = (u.wallet_margin or 0.0) + _txn_sum(transactions)

        start_balance += base_balance
        trade_count += len(unlocked)
        closed_count += len(closed)

        for t in closed:
            pnl, rr = _pnl_of(t, base_balance)
            closed_pairs.append((t, pnl))
            if rr is not None:
                rr_values.append(rr)
            ticks = t.checklist_ticks or {}
            if isinstance(ticks, dict) and ticks:
                total = len(ticks)
                done = sum(1 for v in ticks.values() if v)
                if total:
                    fractions.append(done / total)

    # Order the merged closed trades by date for a combined equity curve.
    closed_pairs.sort(
        key=lambda p: (
            (p[0].close_date or p[0].open_date or datetime.min),
            p[0].number,
        )
    )
    pnls = [pnl for _, pnl in closed_pairs]

    balance = start_balance
    equity_curve: list[dict] = []
    for t, pnl in closed_pairs:
        balance += pnl
        _d = t.close_date or t.open_date
        equity_curve.append(
            {
                "number": len(equity_curve) + 1,
                "balance": balance,
                "pnl": pnl,
                "date": _d.date().isoformat() if _d else None,
            }
        )
    current_balance = balance

    # --- Profit factor ---
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(-p for p in pnls if p < 0)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None

    avg_rr = (sum(rr_values) / len(rr_values)) if rr_values else None

    # --- Win / loss distribution ---
    win_pnls = [p for p in pnls if p > 0]
    loss_pnls = [p for p in pnls if p < 0]
    wins = len(win_pnls)
    win_rate = (wins / closed_count) if closed_count else None
    win_loss = {
        "win": wins,
        "loss": len(loss_pnls),
        "breakeven": sum(1 for p in pnls if p == 0),
        "avgWin": (sum(win_pnls) / len(win_pnls)) if win_pnls else None,
        "avgLoss": (sum(loss_pnls) / len(loss_pnls)) if loss_pnls else None,
    }

    # --- PnL by day (close date) ---
    by_day: dict[str, float] = defaultdict(float)
    for t, pnl in closed_pairs:
        day = t.close_date or t.open_date
        key = day.date().isoformat() if day else "unknown"
        by_day[key] += pnl
    pnl_by_day = [{"date": d, "pnl": v} for d, v in sorted(by_day.items())]

    # --- Direction stats ---
    direction_stats = {
        "long": sum(1 for t, _ in closed_pairs if t.direction == "LONG"),
        "short": sum(1 for t, _ in closed_pairs if t.direction == "SHORT"),
    }

    # --- Session stats ---
    sess_count: dict[str, int] = defaultdict(int)
    sess_pnl: dict[str, float] = defaultdict(float)
    for t, pnl in closed_pairs:
        s = session_for(t.open_date) or "Unknown"
        sess_count[s] += 1
        sess_pnl[s] += pnl
    session_stats = [
        {"session": s, "count": sess_count[s], "pnl": sess_pnl[s]} for s in sess_count
    ]

    # --- Top symbols by PnL ---
    sym_pnl: dict[str, float] = defaultdict(float)
    sym_count: dict[str, int] = defaultdict(int)
    for t, pnl in closed_pairs:
        sym = t.symbol or "?"
        sym_pnl[sym] += pnl
        sym_count[sym] += 1
    top_symbols = sorted(
        ({"symbol": s, "pnl": sym_pnl[s], "count": sym_count[s]} for s in sym_pnl),
        key=lambda x: x["pnl"],
        reverse=True,
    )[:5]

    checklist_discipline = (sum(fractions) / len(fractions)) if fractions else None

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
        win_loss=win_loss,
        top_symbols=top_symbols,
        checklist_discipline=checklist_discipline,
        usdt_irt=irt.get("rate"),
    )


# ── cached AI analyses (read-only showcase) ──────────────────────────────────
@router.get("/team/ai", response_model=list[PublicMemberAI])
async def team_ai(db: AsyncSession = Depends(get_db)) -> list[PublicMemberAI]:
    members = await _team_members(db)
    return [
        PublicMemberAI(
            trader=_display_name(u),
            username=u.username,
            overall=u.ai_overall,
            overall_at=u.ai_overall_at,
            report=u.ai_report,
            report_at=u.ai_report_at,
        )
        for u in members
    ]
