"""لیگ تریدرها (Traders League) — API لیدربرد.

یک اندپوینت اصلی (`GET /api/league`) که لیدربردِ یک بازهٔ شمسی را برمی‌گرداند، و
یک اندپوینت کمکی (`GET /api/league/meta`) برای معیارها و بازه‌های قابل انتخاب.

نمایشِ کاربران عمدی حداقلی است: فقط نام کاربری. شناسهٔ عددی فقط برای ادمین
برگردانده می‌شود تا بتواند از روی ردیفِ لیدربرد داشبورد و ژورنالِ کامل آن تریدر
را باز کند؛ برای کاربرِ عادی این فیلد ``None`` است.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import jalali, league

router = APIRouter(prefix="/api/league", tags=["league"])


class MetricOut(CamelModel):
    key: str
    label: str
    unit: str
    higher_is_better: bool
    hint: str


class WindowOut(CamelModel):
    period: str
    key: str
    label: str
    start: date
    end: date


class EntryOut(CamelModel):
    rank: int
    #: فقط برای ادمین پر می‌شود (برای بازکردن داشبوردِ کامل آن تریدر).
    user_id: int | None
    username: str
    exchanges: list[str]
    trade_count: int
    wins: int
    losses: int
    breakeven: int
    start_balance: float
    end_balance: float
    pnl_usd: float
    pnl_percent: float
    volume: float
    avg_leverage: float | None
    max_drawdown: float
    profit_factor: float | None
    win_rate: float | None
    avg_rr: float | None
    win_streak: int
    green_days: float | None
    discipline: float | None
    best_trade: float
    worst_trade: float
    score: float
    qualified: bool
    #: مثبت = صعود نسبت به دورهٔ قبل، ``None`` = در دورهٔ قبل نبوده.
    rank_change: int | None


class LeagueOut(CamelModel):
    metric: str
    min_trades: int
    window: WindowOut
    previous_key: str
    next_key: str
    #: آیا بازهٔ بعدی هنوز نیامده است (برای غیرفعال‌کردن دکمهٔ «بعدی»).
    has_next: bool
    entries: list[EntryOut]
    #: رتبهٔ خودِ کاربرِ درخواست‌دهنده در همین جدول (اگر شرکت کرده باشد).
    my_rank: int | None


class MetaOut(CamelModel):
    metrics: list[MetricOut]
    periods: list[str]
    default_metric: str
    default_period: str
    min_trades: int
    current: dict[str, WindowOut]


def _window_out(w: jalali.Window) -> WindowOut:
    return WindowOut(period=w.period, key=w.key, label=w.label, start=w.start, end=w.end)


@router.get("/meta", response_model=MetaOut)
async def meta(_user: User = Depends(get_current_user)) -> MetaOut:
    """معیارها، بازه‌ها و «بازهٔ جاری» هر دوره — برای ساختنِ تب‌های لیدربرد."""
    return MetaOut(
        metrics=[
            MetricOut(
                key=m.key, label=m.label, unit=m.unit,
                higher_is_better=m.higher_is_better, hint=m.hint,
            )
            for m in league.METRICS
        ],
        periods=list(jalali.PERIODS),
        default_metric=league.DEFAULT_METRIC,
        default_period="monthly",
        min_trades=league.MIN_TRADES,
        current={p: _window_out(jalali.window_for(p)) for p in jalali.PERIODS},
    )


@router.get("", response_model=LeagueOut)
@router.get("/", response_model=LeagueOut, include_in_schema=False)
async def get_league(
    period: str = Query("monthly", description="daily | weekly | monthly | quarterly | yearly"),
    key: str | None = Query(None, description="شناسهٔ بازه، مثلاً 1404-05؛ خالی = بازهٔ جاری"),
    metric: str = Query(league.DEFAULT_METRIC),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LeagueOut:
    if period not in jalali.PERIODS:
        raise HTTPException(status_code=400, detail="بازهٔ زمانی نامعتبر است")
    if metric not in league.METRIC_KEYS:
        raise HTTPException(status_code=400, detail="معیار نامعتبر است")

    window = jalali.window_for(period, key=key)
    previous = jalali.shift(window, -1)
    nxt = jalali.shift(window, 1)
    entries, moves = await league.leaderboard(db, window, metric, previous=previous)

    is_admin = user.role == "ADMIN"
    out: list[EntryOut] = []
    my_rank: int | None = None
    for i, e in enumerate(entries):
        rank = i + 1
        if e.user_id == user.id:
            my_rank = rank
        out.append(
            EntryOut(
                rank=rank,
                user_id=e.user_id if is_admin else None,
                username=e.username,
                exchanges=e.exchanges,
                trade_count=e.trade_count,
                wins=e.wins,
                losses=e.losses,
                breakeven=e.breakeven,
                start_balance=e.start_balance,
                end_balance=e.end_balance,
                pnl_usd=e.pnl_usd,
                pnl_percent=e.pnl_percent,
                volume=e.volume,
                avg_leverage=e.avg_leverage,
                max_drawdown=e.max_drawdown,
                profit_factor=e.profit_factor,
                win_rate=e.win_rate,
                avg_rr=e.avg_rr,
                win_streak=e.win_streak,
                green_days=e.green_days,
                discipline=e.discipline,
                best_trade=e.best_trade,
                worst_trade=e.worst_trade,
                score=e.score,
                qualified=e.qualified,
                rank_change=moves.get(e.user_id),
            )
        )

    return LeagueOut(
        metric=metric,
        min_trades=league.MIN_TRADES,
        window=_window_out(window),
        previous_key=previous.key,
        next_key=nxt.key,
        has_next=nxt.start <= datetime.now(timezone.utc).date(),
        entries=out,
        my_rank=my_rank,
    )
