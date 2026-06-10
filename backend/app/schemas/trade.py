"""Pydantic schemas for trades, take-profits, and the calc object."""

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.base import CamelModel


class TakeProfitIn(CamelModel):
    order: int
    price: float | None = None
    save_percent: float = 0.0


class TakeProfitOut(CamelModel):
    order: int
    price: float | None = None
    save_percent: float = 0.0


class TradeIn(CamelModel):
    """All fields optional so PATCH can accept any subset (auto-save)."""

    symbol: str | None = None
    direction: str | None = None  # LONG | SHORT
    status: str | None = None  # PLANNED | OPEN | CLOSED
    entry_price: float | None = None
    leverage: float | None = None
    margin_percent: float | None = None
    stop_loss: float | None = None
    analysis_tf: str | None = None
    trigger_tf: str | None = None
    is_risk_free_plan: bool | None = None
    open_date: datetime | None = None
    close_date: datetime | None = None
    exit_type: str | None = None  # RISK_FREE | LAST_TP | STOP_LOSS | TRAILING_STOP
    trail_exit_value: float | None = None
    trail_is_percent: bool | None = None
    is_risk_free_mgmt: bool | None = None
    emotions: dict[str, Any] | None = None
    checklist_ticks: dict[str, Any] | None = None
    entry_reasons: list[str] | None = None
    exit_reasons: list[str] | None = None
    entry_note: str | None = None
    exit_note: str | None = None
    general_note: str | None = None
    image_before: str | None = None
    image_after: str | None = None
    tags: list[str] | None = None
    take_profits: list[TakeProfitIn] | None = None


class PerTpOut(CamelModel):
    order: int
    price: float | None = None
    save_percent: float = 0.0
    spot_pct: float = 0.0
    lev_pct: float = 0.0
    full_dollar: float = 0.0
    saved_dollar: float = 0.0
    rr_dynamic: float | None = None


class CalcOut(CamelModel):
    margin: float = 0.0
    position_size: float = 0.0
    risk1r: float = 0.0
    rr_expected: float | None = None
    rr_achieved: float | None = None
    realized_pnl: float = 0.0
    result_pct: float = 0.0
    session: str | None = None
    per_tp: list[PerTpOut] = Field(default_factory=list)


class TradeOut(CamelModel):
    """All stored trade fields + take_profits + the computed calc object."""

    id: int
    user_id: int
    number: int
    symbol: str | None = None
    direction: str
    status: str
    entry_price: float | None = None
    leverage: float | None = None
    margin_percent: float | None = None
    stop_loss: float | None = None
    analysis_tf: str | None = None
    trigger_tf: str | None = None
    is_risk_free_plan: bool = False
    open_date: datetime | None = None
    close_date: datetime | None = None
    exit_type: str | None = None
    trail_exit_value: float | None = None
    trail_is_percent: bool = False
    is_risk_free_mgmt: bool = False
    realized_pnl: float | None = None
    rr_expected: float | None = None
    rr_achieved: float | None = None
    emotions: dict[str, Any] | None = None
    checklist_ticks: dict[str, Any] | None = None
    entry_reasons: list[str] | None = None
    exit_reasons: list[str] | None = None
    entry_note: str | None = None
    exit_note: str | None = None
    general_note: str | None = None
    image_before: str | None = None
    image_after: str | None = None
    tags: list[str] | None = None
    created_at: datetime
    updated_at: datetime
    take_profits: list[TakeProfitOut] = Field(default_factory=list)
    calc: CalcOut


class CalcPreviewIn(CamelModel):
    """Body for POST /api/calc/preview."""

    direction: str | None = None
    entry_price: float | None = None
    leverage: float | None = None
    margin_percent: float | None = None
    stop_loss: float | None = None
    take_profits: list[TakeProfitIn] = Field(default_factory=list)
    exit_type: str | None = None
    trail_exit_value: float | None = None
    trail_is_percent: bool | None = None
    wallet_balance: float | None = None
