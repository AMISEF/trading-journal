"""Pydantic schemas for market-data responses."""

from app.schemas.base import CamelModel


class SymbolOut(CamelModel):
    symbol: str
    tick_size: float


class PriceOut(CamelModel):
    symbol: str
    price: float | None = None
    raw: str


class TickSizeOut(CamelModel):
    symbol: str
    tick_size: float


class UsdtIrtOut(CamelModel):
    rate: float | None = None
