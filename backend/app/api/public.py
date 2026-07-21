"""Public (no-auth) endpoints that power the landing-page "لایو معاملات ربات الگو
اسمارت" showcase.

They surface a *combined, anonymous* view of every account tagged into the
Cryptosmart Team group ("CRYPTOSMART_TEAM") — these are algo-bot accounts, so no
personal names are ever exposed:

  • merged journal list of all the bots' trades,
  • one aggregated dashboard (per-bot dashboard options summed),
  • the combined team AI analyses (overall + institutional), read-only.

Every bot's capital is normalised to a $1000 starting balance so the combined
figures are comparable and clearly labelled.

Generating the AI analyses is admin-only (a POST); reading everything is public.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.dashboard import DashboardOut, build_user_dashboard
from app.api.serializers import trade_to_out
from app.core.deps import get_current_admin, get_db
from app.db.session import AsyncSessionLocal
from app.models.team_ai import TeamAI
from app.models.template import ChecklistTemplate
from app.models.trade import Trade
from app.models.user import User
from app.schemas.base import CamelModel
from app.schemas.template import ChecklistOut
from app.schemas.trade import TradeOut
from app.services import ai_analysis, calc as calc_engine, dashboard_stats, tabdeal
from app.services.balances import _txn_sum
from app.services.sessions import session_for

logger = logging.getLogger("app.api.public")

router = APIRouter(prefix="/api/public", tags=["public"])

# The group tag assigned via the admin panel (see admin.set_user_group).
TEAM_GROUP = "CRYPTOSMART_TEAM"

# The whole showcase (all bots combined) starts from this single capital, so the
# growth figures are read relative to a flat $1000 — not $1000 per bot.
INITIAL_CAPITAL = 1000.0

_BACKGROUND_TASKS: set[asyncio.Task] = set()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ts(dt: datetime | None) -> float:
    """Sortable timestamp that tolerates None and naive/aware mixes."""
    if dt is None:
        return 0.0
    try:
        return dt.timestamp()
    except (ValueError, OverflowError, OSError):
        return 0.0


async def _team_members(db: AsyncSession) -> list[User]:
    result = await db.execute(
        select(User).where(User.user_group == TEAM_GROUP).order_by(User.id)
    )
    members = list(result.scalars().all())
    # Split the single $1000 starting capital evenly across the bots so the
    # combined figures sum to a flat $1000. Detached from the session so this
    # never persists to the DB.
    per = INITIAL_CAPITAL / (len(members) or 1)
    for u in members:
        u.wallet_margin = per
        db.expunge(u)
    return members


def _pnl_of(trade: Trade, base_balance: float) -> tuple[float, float | None]:
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
    if getattr(trade, "source", None) == "toobit" and trade.realized_pnl is not None:
        pnl = trade.realized_pnl
    return pnl, result.get("rrAchieved")


# ── schemas ──────────────────────────────────────────────────────────────────
class TeamSummary(CamelModel):
    count: int
    initial_capital: float
    total_initial_capital: float


class TeamAIOut(CamelModel):
    enabled: bool = True
    overall: str | None = None
    overall_at: datetime | None = None
    overall_status: str | None = None
    overall_error: str | None = None
    report: str | None = None
    report_at: datetime | None = None
    report_status: str | None = None
    report_error: str | None = None


# ── summary (count only — no names) ──────────────────────────────────────────
@router.get("/team/summary", response_model=TeamSummary)
async def team_summary(db: AsyncSession = Depends(get_db)) -> TeamSummary:
    members = await _team_members(db)
    n = len(members)
    return TeamSummary(
        count=n,
        initial_capital=INITIAL_CAPITAL,
        total_initial_capital=INITIAL_CAPITAL,
    )


# ── a team member's checklist templates (for the read-only detail view) ──────
@router.get("/checklists/{user_id}", response_model=list[ChecklistOut])
async def team_user_checklists(
    user_id: int, db: AsyncSession = Depends(get_db)
) -> list[ChecklistOut]:
    # Only expose checklists that belong to a showcase account (team bot or demo).
    u = await db.get(User, user_id)
    if u is None or (u.user_group != TEAM_GROUP and not getattr(u, "is_demo", False)):
        return []
    result = await db.execute(
        select(ChecklistTemplate).where(ChecklistTemplate.user_id == user_id)
    )
    return [ChecklistOut.model_validate(c) for c in result.scalars().all()]


# ── demo showcase account (a single real journal, shown read-only) ───────────
class DemoSummary(CamelModel):
    available: bool
    name: str | None = None


async def _demo_user(db: AsyncSession) -> User | None:
    """The single account flagged as the demo showcase (lowest id if several)."""
    result = await db.execute(
        select(User).where(User.is_demo.is_(True)).order_by(User.id).limit(1)
    )
    return result.scalars().first()


def _demo_name(u: User) -> str:
    full = f"{(u.first_name or '').strip()} {(u.last_name or '').strip()}".strip()
    return full or (u.username or "").strip() or "دمو"


@router.get("/demo/summary", response_model=DemoSummary)
async def demo_summary(db: AsyncSession = Depends(get_db)) -> DemoSummary:
    u = await _demo_user(db)
    if u is None:
        return DemoSummary(available=False)
    return DemoSummary(available=True, name=_demo_name(u))


@router.get("/demo/trades", response_model=list[TradeOut])
async def demo_trades(db: AsyncSession = Depends(get_db)) -> list[TradeOut]:
    u = await _demo_user(db)
    if u is None:
        return []
    trades = await crud.load_user_trades(db, u.id)
    transactions = await crud.load_user_transactions(db, u.id)
    out = [
        trade_to_out(u, trades, t, transactions)
        for t in trades
        if not getattr(t, "is_locked", False)
    ]
    out.sort(key=lambda t: (_ts(t.open_date), _ts(t.close_date)), reverse=True)
    return out


@router.get("/demo/dashboard", response_model=DashboardOut)
async def demo_dashboard(db: AsyncSession = Depends(get_db)) -> DashboardOut:
    u = await _demo_user(db)
    if u is None:
        raise HTTPException(status_code=404, detail="حساب دمو تنظیم نشده است.")
    return await build_user_dashboard(db, u)


# ── combined journal list (anonymous) ────────────────────────────────────────
@router.get("/team/trades", response_model=list[TradeOut])
async def team_trades(db: AsyncSession = Depends(get_db)) -> list[TradeOut]:
    members = await _team_members(db)
    out: list[TradeOut] = []
    for u in members:
        trades = await crud.load_user_trades(db, u.id)
        transactions = await crud.load_user_transactions(db, u.id)
        for t in trades:
            if getattr(t, "is_locked", False):
                continue
            out.append(trade_to_out(u, trades, t, transactions))
    out.sort(key=lambda t: (_ts(t.open_date), _ts(t.close_date)), reverse=True)
    return out


# ── aggregated dashboard (sum of the per-bot dashboards, $1000 each) ──────────
@router.get("/team/dashboard", response_model=DashboardOut)
async def team_dashboard(db: AsyncSession = Depends(get_db)) -> DashboardOut:
    members = await _team_members(db)

    start_balance = 0.0
    trade_count = 0
    closed_count = 0
    closed_pairs: list[tuple[Trade, float]] = []
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
            # Toobit trades carry a margin-based achieved-R computed at import.
            if getattr(t, "source", None) == "toobit" and t.rr_achieved is not None:
                rr = t.rr_achieved
            if rr is not None:
                rr_values.append(rr)
            ticks = t.checklist_ticks or {}
            if isinstance(ticks, dict) and ticks:
                total = len(ticks)
                done = sum(1 for v in ticks.values() if v)
                if total:
                    fractions.append(done / total)

    closed_pairs.sort(key=lambda p: (_ts(p[0].close_date or p[0].open_date), p[0].number))
    pnls = [pnl for _, pnl in closed_pairs]

    balance = start_balance
    equity_curve: list[dict] = []
    for t, pnl in closed_pairs:
        balance += pnl
        _d = t.close_date or t.open_date
        equity_curve.append({
            "number": len(equity_curve) + 1,
            "balance": balance,
            "pnl": pnl,
            "date": _d.date().isoformat() if _d else None,
        })
    current_balance = balance

    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(-p for p in pnls if p < 0)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None

    avg_rr = (sum(rr_values) / len(rr_values)) if rr_values else None

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

    by_day: dict[str, float] = defaultdict(float)
    for t, pnl in closed_pairs:
        day = t.close_date or t.open_date
        key = day.date().isoformat() if day else "unknown"
        by_day[key] += pnl
    pnl_by_day = [{"date": d, "pnl": v} for d, v in sorted(by_day.items())]

    extra = dashboard_stats.compute_extra(
        [t for t, _ in closed_pairs], pnls, start_balance
    )
    direction_stats = extra["direction_stats"]

    sess_count: dict[str, int] = defaultdict(int)
    sess_pnl: dict[str, float] = defaultdict(float)
    for t, pnl in closed_pairs:
        s = session_for(t.open_date) or "Unknown"
        sess_count[s] += 1
        sess_pnl[s] += pnl
    session_stats = [
        {"session": s, "count": sess_count[s], "pnl": sess_pnl[s]} for s in sess_count
    ]

    top_symbols = extra["top_symbols"]

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
        worst_symbols=extra["worst_symbols"],
        max_drawdown=extra["max_drawdown"],
        win_streak=extra["win_streak"],
        loss_streak=extra["loss_streak"],
    )


# ── combined team AI (read public, generate admin) ───────────────────────────
async def _get_team_ai(db: AsyncSession) -> TeamAI:
    row = await db.get(TeamAI, 1)
    if row is None:
        row = TeamAI(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _team_ai_out(row: TeamAI) -> TeamAIOut:
    return TeamAIOut(
        enabled=ai_analysis.is_enabled(),
        overall=row.overall,
        overall_at=row.overall_at,
        overall_status=row.overall_status,
        overall_error=row.overall_error,
        report=row.report,
        report_at=row.report_at,
        report_status=row.report_status,
        report_error=row.report_error,
    )


@router.get("/team/ai", response_model=TeamAIOut)
async def team_ai(db: AsyncSession = Depends(get_db)) -> TeamAIOut:
    row = await _get_team_ai(db)
    return _team_ai_out(row)


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)


async def _members_data(db: AsyncSession):
    """Load [(user, trades, transactions)] for every bot, capital = $1000."""
    members = await _team_members(db)
    data = []
    for u in members:
        trades = await crud.load_user_trades(db, u.id)
        transactions = await crud.load_user_transactions(db, u.id)
        data.append((u, trades, transactions))
    return data


@router.post("/team/ai/overall", response_model=TeamAIOut)
async def generate_team_overall(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> TeamAIOut:
    if not ai_analysis.is_enabled():
        raise HTTPException(status_code=503, detail="تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است.")
    row = await _get_team_ai(db)
    row.overall_status = "PENDING"
    row.overall_error = None
    await db.commit()
    _spawn(_run_team_job("overall"))
    return _team_ai_out(row)


@router.post("/team/ai/report", response_model=TeamAIOut)
async def generate_team_report(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> TeamAIOut:
    if not ai_analysis.is_enabled():
        raise HTTPException(status_code=503, detail="تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است.")
    row = await _get_team_ai(db)
    row.report_status = "PENDING"
    row.report_error = None
    await db.commit()
    _spawn(_run_team_job("report"))
    return _team_ai_out(row)


async def _run_team_job(kind: str) -> None:
    """Background worker: build the combined team analysis and cache it."""
    async with AsyncSessionLocal() as db:
        try:
            data = await _members_data(db)
            if kind == "overall":
                text = await ai_analysis.analyze_team_overall(data)
            else:
                text = await ai_analysis.analyze_team_institutional(data)
            row = await _get_team_ai(db)
            if kind == "overall":
                row.overall = text
                row.overall_at = _utcnow()
                row.overall_status = "DONE"
                row.overall_error = None
            else:
                row.report = text
                row.report_at = _utcnow()
                row.report_status = "DONE"
                row.report_error = None
            await db.commit()
        except Exception as exc:  # noqa: BLE001 - record failure for the client
            logger.exception("team AI %s failed", kind)
            async with AsyncSessionLocal() as db2:
                row = await _get_team_ai(db2)
                if kind == "overall":
                    row.overall_status = "ERROR"
                    row.overall_error = str(exc)[:500]
                else:
                    row.report_status = "ERROR"
                    row.report_error = str(exc)[:500]
                await db2.commit()
