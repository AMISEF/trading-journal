"""Market-data proxy routes (Toobit prices/symbols + Tabdeal USDT/IRT)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.market import PriceOut, SymbolOut, TickSizeOut, UsdtIrtOut
from app.services import tabdeal, toobit

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/symbols", response_model=list[SymbolOut])
async def symbols(
    q: str = Query(default=""),
    _user: User = Depends(get_current_user),
) -> list[SymbolOut]:
    data = await toobit.get_symbols(q=q, limit=20)
    return [SymbolOut.model_validate(s) for s in data]


@router.get("/price", response_model=PriceOut)
async def price(
    symbol: str = Query(...),
    _user: User = Depends(get_current_user),
) -> PriceOut:
    data = await toobit.get_price(symbol)
    return PriceOut.model_validate(data)


@router.get("/ticksize", response_model=TickSizeOut)
async def ticksize(
    symbol: str = Query(...),
    _user: User = Depends(get_current_user),
) -> TickSizeOut:
    data = await toobit.get_tick_size(symbol)
    return TickSizeOut.model_validate(data)


@router.get("/usdt-irt", response_model=UsdtIrtOut)
async def usdt_irt(
    _user: User = Depends(get_current_user),
) -> UsdtIrtOut:
    data = await tabdeal.get_usdt_irt()
    return UsdtIrtOut.model_validate(data)
