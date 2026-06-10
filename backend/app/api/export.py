"""Excel export of the user's trades."""

from __future__ import annotations

import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.core.deps import get_db, get_user_token_or_query
from app.models.user import User
from app.services import balances

router = APIRouter(prefix="/api/export", tags=["export"])

# Columns in the exported spreadsheet, in order: (trade attribute, header label).
_COLUMNS = [
    ("number", "Number"),
    ("symbol", "Symbol"),
    ("direction", "Direction"),
    ("status", "Status"),
    ("entry_price", "Entry Price"),
    ("leverage", "Leverage"),
    ("margin_percent", "Margin %"),
    ("stop_loss", "Stop Loss"),
    ("open_date", "Open Date"),
    ("close_date", "Close Date"),
    ("rr_expected", "RR Expected"),
    ("rr_achieved", "RR Achieved"),
    ("realized_pnl", "Realized PnL"),
    ("result_pct", "Result %"),
]


def _naive(value):
    """openpyxl can't write tz-aware datetimes; strip the timezone if present."""
    if value is not None and hasattr(value, "tzinfo") and value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


@router.get("/trades.xlsx")
async def export_trades_xlsx(
    user: User = Depends(get_user_token_or_query),
    db: AsyncSession = Depends(get_db),
):
    trades = await crud.load_user_trades(db, user.id)

    wb = Workbook()
    ws = wb.active
    ws.title = "Trades"
    ws.append([label for _, label in _COLUMNS])  # header row

    for t in trades:
        # result_pct is a computed value, not stored on the row.
        calc = balances.compute_for_trade(user, trades, t)
        row = []
        for attr, _ in _COLUMNS:
            if attr == "result_pct":
                row.append(calc.get("resultPct"))
            else:
                row.append(_naive(getattr(t, attr, None)))
        ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="trades.xlsx"'},
    )
