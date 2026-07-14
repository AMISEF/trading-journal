"""Password reset (forgot, from the login page) and change (logged in, from
settings) — both via an emailed one-time code (Resend).

Flows:
  • Forgot:  POST /api/auth/forgot-password {email}      → email a code
             POST /api/auth/reset-password  {email, code, newPassword}
  • Change:  POST /api/settings/password/request-code    → email the current
             user a code
             POST /api/settings/password/change {code, newPassword}
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.core.security import gen_code, hash_code, hash_password, verify_code
from app.models.auth_code import AuthCode
from app.models.user import User
from app.schemas.base import CamelModel
from app.services import mailer

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

_PURPOSE = "reset"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── schemas ──────────────────────────────────────────────────────────────────
class ForgotIn(CamelModel):
    email: str


class ResetIn(CamelModel):
    email: str
    code: str
    new_password: str


class ChangeIn(CamelModel):
    code: str
    new_password: str


def _valid_password(pw: str) -> None:
    if not pw or len(pw) < 6:
        raise HTTPException(status_code=400, detail="رمز عبور باید حداقل ۶ کاراکتر باشد.")


# ── shared helpers ───────────────────────────────────────────────────────────
async def _send_code(db: AsyncSession, email: str) -> None:
    """Generate, store (hashed) and email a code. Enforces a resend cooldown."""
    email = email.strip().lower()
    recent = (await db.execute(
        select(AuthCode).where(AuthCode.email == email, AuthCode.purpose == _PURPOSE)
        .order_by(AuthCode.created_at.desc())
    )).scalars().first()
    if recent and (_utcnow() - recent.created_at).total_seconds() < settings.AUTH_CODE_COOLDOWN:
        wait = int(settings.AUTH_CODE_COOLDOWN - (_utcnow() - recent.created_at).total_seconds())
        raise HTTPException(status_code=429, detail=f"لطفاً {max(wait, 1)} ثانیه دیگر دوباره تلاش کنید.")

    code = gen_code()
    db.add(AuthCode(
        email=email, code_hash=hash_code(code), purpose=_PURPOSE,
        expires_at=_utcnow() + timedelta(seconds=settings.AUTH_CODE_TTL),
    ))
    await db.commit()

    subject, html, text = mailer.reset_email_content(code)
    try:
        await mailer.send_email(email, subject, html, text)
    except mailer.MailNotConfigured as exc:
        raise HTTPException(status_code=503, detail="سرویس ایمیل روی سرور پیکربندی نشده است.") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="ارسال ایمیل ناموفق بود. بعداً تلاش کنید.") from exc


async def _consume_code(db: AsyncSession, email: str, code: str) -> None:
    """Validate the newest unused code for the email, or raise."""
    email = email.strip().lower()
    active = (await db.execute(
        select(AuthCode).where(
            AuthCode.email == email, AuthCode.purpose == _PURPOSE, AuthCode.used.is_(False),
        ).order_by(AuthCode.created_at.desc())
    )).scalars().first()
    if active is None or active.expires_at < _utcnow():
        raise HTTPException(status_code=410, detail="کد منقضی شده یا یافت نشد. کد جدید بخواهید.")
    if active.attempts >= settings.AUTH_CODE_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="تعداد تلاش‌ها بیش از حد مجاز است. کد جدید بخواهید.")
    if not verify_code(code.strip(), active.code_hash):
        active.attempts += 1
        await db.commit()
        left = max(settings.AUTH_CODE_MAX_ATTEMPTS - active.attempts, 0)
        raise HTTPException(status_code=401, detail=f"کد نادرست است. {left} تلاش باقی مانده.")
    active.used = True
    await db.commit()


async def _set_password(db: AsyncSession, user: User, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    await db.commit()


# ── forgot password (login page) ─────────────────────────────────────────────
@auth_router.post("/forgot-password")
async def forgot_password(body: ForgotIn, db: AsyncSession = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalars().first()
    # Only actually send when the account exists, but always answer the same way
    # so this can't be used to probe which emails are registered.
    if user is not None:
        await _send_code(db, email)
    return {"ok": True}


@auth_router.post("/reset-password")
async def reset_password(body: ResetIn, db: AsyncSession = Depends(get_db)) -> dict:
    _valid_password(body.new_password)
    email = body.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="حسابی با این ایمیل یافت نشد.")
    await _consume_code(db, email, body.code)
    await _set_password(db, user, body.new_password)
    return {"ok": True}


# ── change password (settings, logged in) ────────────────────────────────────
@settings_router.post("/password/request-code")
async def request_change_code(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> dict:
    await _send_code(db, user.email)
    return {"ok": True, "email": user.email}


@settings_router.post("/password/change")
async def change_password(
    body: ChangeIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> dict:
    _valid_password(body.new_password)
    await _consume_code(db, user.email, body.code)
    await _set_password(db, user, body.new_password)
    return {"ok": True}
