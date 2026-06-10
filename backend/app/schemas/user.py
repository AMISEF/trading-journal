"""Pydantic schemas for users and authentication."""

from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.base import CamelModel


class UserOut(CamelModel):
    """The user object returned everywhere in the API."""

    id: int
    email: str
    username: str
    first_name: str
    last_name: str
    role: str
    wallet_margin: float
    # currentBalance = walletMargin + sum(realizedPnl of CLOSED trades).
    current_balance: float
    created_at: datetime


class RegisterIn(CamelModel):
    email: EmailStr
    username: str = Field(min_length=1)
    first_name: str
    last_name: str
    password: str = Field(min_length=1)
    password_confirm: str


class LoginIn(CamelModel):
    # "username" may actually be the username OR the email.
    username: str
    password: str


class WalletIn(CamelModel):
    wallet_margin: float


class TokenOut(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
