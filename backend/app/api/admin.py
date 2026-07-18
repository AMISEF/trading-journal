"""Admin-only routes (require role ADMIN)."""

from __future__ import annotations

from collections import defaultdict
from typing import Optional

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import EmailStr
from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import trade_to_out, user_to_out
from app.core.deps import get_current_admin, get_db
from app.core.security import hash_password
from app.models.template import ChecklistTemplate, ReasonTemplate
from app.models.trade import TakeProfit, Trade
from app.models.user import User
from app.schemas.template import ChecklistOut
from app.schemas.base import CamelModel
from app.schemas.trade import TradeOut
from app.schemas.user import UserOut
from app.services import balances, calc as calc_engine, plans, tabdeal
from app.services.balances import _txn_sum
from app.services.sessions import session_for

router = APIRouter(prefix="/api/admin", tags=["admin"])

# The only roles the app recognises. Reject anything else so an admin can't
# accidentally (or a compromised admin session can't) set an arbitrary role
# string that silently bypasses the ADMIN/TRADER checks elsewhere.
_VALID_ROLES = {"ADMIN", "TRADER"}


def _validate_role(role: str | None) -> None:
    if role is not None and role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")


# ---------------------------------------------------------------------------
# Inline request schemas
# ---------------------------------------------------------------------------


class AdminUserCreate(CamelModel):
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    password: str
    role: str = "TRADER"
    wallet_margin: float = 0.0


class AdminUserUpdate(CamelModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None
    wallet_margin: Optional[float] = None


class AdminResetPassword(CamelModel):
    new_password: str


class AdminSetGroup(CamelModel):
    user_group: str | None = None


class AdminSetPlan(CamelModel):
    plan: str  # bronze | silver | gold
    # Convenience: set duration in months from *now* instead of an exact date.
    # 0/None = no expiry (until manually changed). Ignored for bronze.
    duration_months: float | None = None


# ---------------------------------------------------------------------------
# Re-export DashboardOut so callers can import from one place if needed
# ---------------------------------------------------------------------------

from app.api.dashboard import DashboardOut  # noqa: E402


# ---------------------------------------------------------------------------
# Existing endpoints
# ---------------------------------------------------------------------------


@router.get("/users", response_model=list[UserOut])
async def list_users(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserOut]:
    result = await db.execute(select(User).order_by(User.id))
    users = list(result.scalars().all())
    out: list[UserOut] = []
    for u in users:
        trades = await crud.load_user_trades(db, u.id)
        transactions = await crud.load_user_transactions(db, u.id)
        out.append(user_to_out(u, trades, transactions))
    return out


@router.get("/users/{user_id}/trades", response_model=list[TradeOut])
async def user_trades(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TradeOut]:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return [trade_to_out(target, trades, t, transactions) for t in trades]


@router.get("/trades/{trade_id}", response_model=TradeOut)
async def admin_get_trade(
    trade_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> TradeOut:
    trade = await db.get(Trade, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    owner = await db.get(User, trade.user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Trade owner not found")
    trades = await crud.load_user_trades(db, owner.id)
    transactions = await crud.load_user_transactions(db, owner.id)
    # Find the freshly loaded version (with take_profits) to serialize.
    loaded = next((t for t in trades if t.id == trade.id), trade)
    return trade_to_out(owner, trades, loaded, transactions)


# ---------------------------------------------------------------------------
# New user-management endpoints
# ---------------------------------------------------------------------------


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: AdminUserCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    _validate_role(body.role)
    # Duplicate email check
    existing_email = await db.execute(select(User).where(User.email == body.email))
    if existing_email.scalars().first() is not None:
        raise HTTPException(status_code=409, detail="Email already in use")

    # Duplicate username check
    existing_username = await db.execute(
        select(User).where(User.username == body.username)
    )
    if existing_username.scalars().first() is not None:
        raise HTTPException(status_code=409, detail="Username already in use")

    new_user = User(
        email=body.email,
        username=body.username,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=hash_password(body.password),
        role=body.role,
        wallet_margin=body.wallet_margin,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    trades = await crud.load_user_trades(db, new_user.id)
    transactions = await crud.load_user_transactions(db, new_user.id)
    return user_to_out(new_user, trades, transactions)


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: AdminUserUpdate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    _validate_role(body.role)
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    if body.email is not None:
        conflict = await db.execute(
            select(User).where(User.email == body.email, User.id != user_id)
        )
        if conflict.scalars().first() is not None:
            raise HTTPException(status_code=409, detail="Email already in use")
        target.email = body.email

    if body.username is not None:
        conflict = await db.execute(
            select(User).where(User.username == body.username, User.id != user_id)
        )
        if conflict.scalars().first() is not None:
            raise HTTPException(status_code=409, detail="Username already in use")
        target.username = body.username

    if body.first_name is not None:
        target.first_name = body.first_name
    if body.last_name is not None:
        target.last_name = body.last_name
    if body.role is not None:
        target.role = body.role
    if body.wallet_margin is not None:
        target.wallet_margin = body.wallet_margin

    await db.commit()
    await db.refresh(target)

    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return user_to_out(target, trades, transactions)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    # Delete templates first (no cascade on User model for these).
    checklists = await db.execute(
        select(ChecklistTemplate).where(ChecklistTemplate.user_id == user_id)
    )
    for row in checklists.scalars().all():
        await db.delete(row)
    reasons = await db.execute(
        select(ReasonTemplate).where(ReasonTemplate.user_id == user_id)
    )
    for row in reasons.scalars().all():
        await db.delete(row)
    await db.flush()
    await db.delete(target)
    await db.commit()
    return {"ok": True}


@router.delete("/trades/{trade_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def admin_delete_trade(
    trade_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    # Read only the columns we need — avoids loading the ORM relationship and the
    # async lazy-load cascade that fails for trades that have take_profits.
    row = await db.execute(
        select(Trade.user_id, Trade.number).where(Trade.id == trade_id)
    )
    found = row.first()
    if found is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    user_id, deleted_number = found

    # Delete children then the trade with plain Core statements (no ORM cascade),
    # then renumber. Statements run sequentially in one transaction, so the row
    # is gone before the renumber UPDATE and no unique constraint can clash.
    await db.execute(delete(TakeProfit).where(TakeProfit.trade_id == trade_id))
    await db.execute(delete(Trade).where(Trade.id == trade_id))
    # Two-step renumber to avoid per-row unique constraint violations in PostgreSQL.
    # Step 1: negate all affected numbers (safe — all positive numbers become negative)
    await db.execute(
        text("UPDATE trades SET number = -number WHERE user_id = :uid AND number > :n"),
        {"uid": user_id, "n": deleted_number},
    )
    # Step 2: shift negated numbers to their final values (-n → n-1)
    await db.execute(
        text("UPDATE trades SET number = (-number) - 1 WHERE user_id = :uid AND number < 0"),
        {"uid": user_id},
    )
    await db.commit()


@router.post("/users/{user_id}/set-group", response_model=UserOut)
async def set_user_group(
    user_id: int,
    body: AdminSetGroup,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Assign (or remove) a user from a group, e.g. 'CRYPTOSMART_TEAM'."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    target.user_group = body.user_group
    await db.commit()
    await db.refresh(target)
    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return user_to_out(target, trades, transactions)


@router.post("/users/{user_id}/set-plan", response_model=UserOut)
async def set_user_plan(
    user_id: int,
    body: AdminSetPlan,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Assign a subscription plan to a user, optionally for a fixed duration.

    This is the *only* way a plan changes — there is no self-service upgrade
    endpoint. Payment is handled manually (off-platform) and the admin
    assigns the plan here once it's confirmed.
    """
    tier = body.plan.lower()
    if tier not in plans.PLAN_LIMITS:
        raise HTTPException(status_code=400, detail="پلن نامعتبر است")
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.subscription_tier = tier
    if tier == "bronze" or not body.duration_months:
        target.subscription_expires_at = None
    else:
        target.subscription_expires_at = datetime.now(timezone.utc) + plans.plan_duration(body.duration_months)

    await db.commit()
    await db.refresh(target)
    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return user_to_out(target, trades, transactions)


@router.post("/users/{user_id}/reset-capital", response_model=UserOut)
async def reset_user_capital(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Reset a user's capital to $1000, lock all existing trades, record reset date."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.wallet_margin = 1000.0
    target.capital_reset_date = datetime.now(timezone.utc)

    # Lock all existing trades for this user.
    await db.execute(
        update(Trade).where(Trade.user_id == user_id).values(is_locked=True)
    )
    await db.commit()
    await db.refresh(target)
    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return user_to_out(target, trades, transactions)


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    body: AdminResetPassword,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Per-user checklist templates (admin read-only)
# ---------------------------------------------------------------------------


@router.get("/users/{user_id}/checklists", response_model=list[ChecklistOut])
async def user_checklists(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ChecklistOut]:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        select(ChecklistTemplate).where(ChecklistTemplate.user_id == user_id)
    )
    return [ChecklistOut.model_validate(c) for c in result.scalars().all()]


# ---------------------------------------------------------------------------
# Per-user dashboard (admin view)
# ---------------------------------------------------------------------------


@router.get("/users/{user_id}/dashboard", response_model=DashboardOut)
async def user_dashboard(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> DashboardOut:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    unlocked = [t for t in trades if not getattr(t, "is_locked", False)]
    closed = [t for t in unlocked if t.status == "CLOSED"]
    closed.sort(key=lambda t: t.number)

    trade_count = len(unlocked)
    closed_count = len(closed)

    # --- Running equity curve + per-trade PnL + RR ---
    balance = (target.wallet_margin or 0.0) + _txn_sum(transactions)
    equity_curve: list[dict] = []
    pnls: list[float] = []
    rr_values: list[float] = []
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
        pnl = result["realizedPnl"]
        rr = result.get("rrAchieved")
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

    # --- Profit factor ---
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(-p for p in pnls if p < 0)
    if gross_loss > 0:
        profit_factor = gross_profit / gross_loss
    elif gross_profit > 0:
        profit_factor = None  # no losses at all -> "infinite"; report None
    else:
        profit_factor = None

    # --- Average RR achieved ---
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
    for t, pnl in zip(closed, pnls):
        day = t.close_date or t.open_date
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

    # --- Checklist discipline ---
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
        win_loss=win_loss,
        top_symbols=top_symbols,
        checklist_discipline=checklist_discipline,
        usdt_irt=irt.get("rate"),
    )
