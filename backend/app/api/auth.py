"""Authentication routes: register, login, current user, wallet update."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import user_to_out
from app.core.deps import get_current_user, get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.user import LoginIn, RegisterIn, TokenOut, UserOut, WalletIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _token_response(db: AsyncSession, user: User) -> TokenOut:
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    token = create_access_token(user.id)
    return TokenOut(
        access_token=token,
        token_type="bearer",
        user=user_to_out(user, trades, transactions),
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    if body.password != body.password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    existing = await db.execute(
        select(User).where(
            or_(User.email == body.email, User.username == body.username)
        )
    )
    if existing.scalars().first() is not None:
        raise HTTPException(status_code=400, detail="Email or username already in use")

    count_result = await db.execute(select(func.count()).select_from(User))
    is_first = (count_result.scalar() or 0) == 0

    user = User(
        email=str(body.email),
        username=body.username,
        first_name=body.first_name,
        last_name=body.last_name,
        password_hash=hash_password(body.password),
        role="ADMIN" if is_first else "TRADER",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return await _token_response(db, user)


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    result = await db.execute(
        select(User).where(
            or_(User.username == body.username, User.email == body.username)
        )
    )
    user = result.scalars().first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return await _token_response(db, user)


@router.get("/me", response_model=UserOut)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    return user_to_out(user, trades, transactions)


@router.patch("/wallet", response_model=UserOut)
async def update_wallet(
    body: WalletIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    user.wallet_margin = body.wallet_margin
    await db.commit()
    await db.refresh(user)
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    return user_to_out(user, trades, transactions)
