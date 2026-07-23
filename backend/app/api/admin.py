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
from app.services import balances, calc as calc_engine, dashboard_stats, plans, tabdeal
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


class AdminSetDemo(CamelModel):
    is_demo: bool


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


@router.post("/users/{user_id}/set-demo", response_model=UserOut)
async def set_user_demo(
    user_id: int,
    body: AdminSetDemo,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Mark (or unmark) a user as *the* site demo account. Only one demo exists,
    so setting one clears the flag on everyone else. Independent of the group, so
    a demo account can also stay in Cryptosmart Team."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.is_demo:
        # Clear any previous demo so exactly one account is the demo.
        await db.execute(
            update(User).where(User.id != user_id).values(is_demo=False)
        )
        target.is_demo = True
    else:
        target.is_demo = False
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
    """Start a new capital cycle: set the user's capital to $1000 and stamp the
    reset date. Previous-month trades stay editable but no longer affect the new
    month's balance or stats (they're before the reset date)."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.wallet_margin = 1000.0
    target.capital_reset_date = datetime.now(timezone.utc)

    # No locking anymore — clear any leftover locks so all trades stay editable.
    await db.execute(
        update(Trade).where(Trade.user_id == user_id).values(is_locked=False)
    )
    await db.commit()
    await db.refresh(target)
    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return user_to_out(target, trades, transactions)


@router.post("/users/{user_id}/unlock-trades", response_model=UserOut)
async def unlock_user_trades(
    user_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Undo a capital reset: unlock all of the user's trades (make them editable
    again) and clear the reset date. Wallet capital is left as-is (adjust it via
    the user's wallet-margin field if needed)."""
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    await db.execute(
        update(Trade).where(Trade.user_id == user_id).values(is_locked=False)
    )
    target.capital_reset_date = None
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
    # Reuse the shared (cycle-aware) computation so the admin view matches the
    # user's own dashboard exactly.
    from app.api.dashboard import build_user_dashboard
    return await build_user_dashboard(db, target)
