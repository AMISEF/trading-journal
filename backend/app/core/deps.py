"""FastAPI dependencies: getting the current logged-in user from a token."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

# Tells FastAPI where the login endpoint is (used for the docs "Authorize" button).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def _user_from_token(token: str | None, db: AsyncSession) -> User:
    if not token:
        raise _CREDENTIALS_ERROR
    sub = decode_access_token(token)
    if sub is None:
        raise _CREDENTIALS_ERROR
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise _CREDENTIALS_ERROR
    user = await db.get(User, user_id)
    if user is None:
        raise _CREDENTIALS_ERROR
    return user


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the logged-in user from the Authorization: Bearer header."""
    return await _user_from_token(token, db)


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Like get_current_user but also requires the ADMIN role."""
    if user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


async def get_user_token_or_query(
    request: Request,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Auth that accepts a Bearer header OR a ``?token=`` query parameter.

    Needed for file downloads (e.g. the Excel export), because a browser
    download cannot send custom headers.
    """
    bearer = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        bearer = auth_header[7:].strip()
    return await _user_from_token(bearer or token, db)


# Re-export so routers can import the session dependency from one place.
__all__ = [
    "get_current_user",
    "get_current_admin",
    "get_user_token_or_query",
    "get_db",
]
