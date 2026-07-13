"""Pydantic schemas for users and authentication."""

import re
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.schemas.base import CamelModel

PHONE_RE = re.compile(r"^09\d{9}$")


class UserOut(CamelModel):
    """The user object returned everywhere in the API."""

    id: int
    email: str
    username: str
    first_name: str
    last_name: str
    role: str
    phone: str | None = None
    wallet_margin: float
    # currentBalance = walletMargin + sum(realizedPnl of CLOSED, unlocked trades).
    current_balance: float
    user_group: str | None = None
    capital_reset_date: datetime | None = None
    subscription_tier: str
    subscription_expires_at: datetime | None = None
    created_at: datetime
    # Whether the user has stored Toobit credentials (the keys themselves are
    # never returned) and a masked preview (last 4 chars) for confirmation.
    has_toobit_api_key: bool = False
    toobit_api_key_masked: str | None = None
    has_toobit_secret_key: bool = False


class RegisterIn(CamelModel):
    email: EmailStr
    username: str = Field(min_length=1)
    first_name: str
    last_name: str
    phone: str
    password: str = Field(min_length=1)
    password_confirm: str

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        v = (v or "").strip()
        if not PHONE_RE.match(v):
            raise ValueError("شماره تماس باید به صورت 09121234567 و ۱۱ رقم باشد.")
        return v


class LoginIn(CamelModel):
    # "username" may actually be the username OR the email.
    username: str
    password: str


class WalletIn(CamelModel):
    wallet_margin: float


def _valid_toobit_key(v: str, label: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError(f"{label} را وارد کنید.")
    # Toobit keys are long alphanumeric strings; keep the check lenient but reject
    # obviously wrong input (spaces, control chars, wild lengths).
    if len(v) < 16 or len(v) > 128:
        raise ValueError(f"{label} معتبر نیست (طول نامعتبر).")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", v):
        raise ValueError(f"{label} فقط می‌تواند شامل حروف، عدد، خط تیره و زیرخط باشد.")
    return v


class ToobitApiKeyIn(CamelModel):
    """The Toobit *Access API Key* + *Secret Key* the user copies from Toobit.

    The secret is optional here for backward compatibility, but both are required
    to sign the private requests that auto-import the user's futures trades.
    """

    access_api_key: str
    secret_api_key: str | None = None

    @field_validator("access_api_key")
    @classmethod
    def _validate_access(cls, v: str) -> str:
        return _valid_toobit_key(v, "Access API Key")

    @field_validator("secret_api_key")
    @classmethod
    def _validate_secret(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        return _valid_toobit_key(v, "Secret Key")


class TokenOut(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
