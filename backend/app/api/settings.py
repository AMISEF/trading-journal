"""User settings routes — currently the Toobit exchange API key.

The key is encrypted at rest (app.core.crypto) and never returned in plaintext;
responses only carry ``hasToobitApiKey`` + a masked preview via the standard
UserOut serializer.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import user_to_out
from app.core import crypto
from app.core.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user import ToobitApiKeyIn, UserOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def _user_out(db: AsyncSession, user: User) -> UserOut:
    trades = await crud.load_user_trades(db, user.id)
    transactions = await crud.load_user_transactions(db, user.id)
    return user_to_out(user, trades, transactions)


@router.put("/toobit-api-key", response_model=UserOut)
async def save_toobit_api_key(
    body: ToobitApiKeyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Store (encrypted) the user's Toobit Access API Key and Secret Key."""
    user.toobit_api_key_enc = crypto.encrypt(body.access_api_key)
    if body.secret_api_key:
        user.toobit_secret_key_enc = crypto.encrypt(body.secret_api_key)
    await db.commit()
    await db.refresh(user)
    return await _user_out(db, user)


@router.delete("/toobit-api-key", response_model=UserOut)
async def delete_toobit_api_key(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Remove the stored Toobit API credentials."""
    user.toobit_api_key_enc = None
    user.toobit_secret_key_enc = None
    await db.commit()
    await db.refresh(user)
    return await _user_out(db, user)
