"""Admin: مدیریتِ عضویتِ کاربر در گروه‌های نمایشی (چندگانه).

اندپوینتِ قدیمیِ `POST /api/admin/users/{id}/set-group` کلِ عضویت را با یک گروه
جایگزین می‌کند؛ همان رفتار بود که باعث می‌شد افزودنِ کاربر به «لایو ترید» او را
از «تیم کریپتو اسمارت» بیرون بیندازد. اندپوینت‌های این فایل یک گروه را مستقل
اضافه یا حذف می‌کنند و به بقیهٔ عضویت‌ها دست نمی‌زنند.

* `POST /api/admin/users/{id}/groups` با بدنهٔ `{group, member}` → افزودن/حذفِ
  یک گروه.
* `PUT  /api/admin/users/{id}/groups` با بدنهٔ `{userGroups: [...]}` → جایگزینیِ
  کاملِ لیستِ عضویت‌ها (برای ابزارها/اسکریپت‌ها).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.api.serializers import user_to_out
from app.core.deps import get_current_admin, get_db
from app.models.user import User
from app.schemas.base import CamelModel
from app.schemas.user import UserOut
from app.services import groups as groups_svc

router = APIRouter(prefix="/api/admin", tags=["admin"])


class GroupMembershipIn(CamelModel):
    """یک گروه را اضافه (`member=True`) یا حذف (`member=False`) می‌کند."""

    group: str
    member: bool = True


class GroupsIn(CamelModel):
    """جایگزینیِ کاملِ لیستِ عضویت‌ها."""

    user_groups: list[str] = []


async def _load_target(db: AsyncSession, user_id: int) -> User:
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


async def _commit_and_serialize(db: AsyncSession, target: User) -> UserOut:
    await db.commit()
    await db.refresh(target)
    trades = await crud.load_user_trades(db, target.id)
    transactions = await crud.load_user_transactions(db, target.id)
    return user_to_out(target, trades, transactions)


@router.post("/users/{user_id}/groups", response_model=UserOut)
async def set_group_membership(
    user_id: int,
    body: GroupMembershipIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """عضویتِ کاربر در یک گروه را روشن/خاموش می‌کند (بقیه دست‌نخورده)."""
    group = (body.group or "").strip()
    if group not in groups_svc.KNOWN_GROUPS:
        raise HTTPException(status_code=400, detail="گروه نامعتبر است")
    target = await _load_target(db, user_id)
    target.user_group_raw = groups_svc.toggled(
        target.user_group_raw, group, body.member
    )
    return await _commit_and_serialize(db, target)


@router.put("/users/{user_id}/groups", response_model=UserOut)
async def replace_groups(
    user_id: int,
    body: GroupsIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """کلِ لیستِ عضویت‌های کاربر را با لیستِ داده‌شده جایگزین می‌کند."""
    try:
        wanted = groups_svc.validate(body.user_groups)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    target = await _load_target(db, user_id)
    target.user_groups = wanted
    return await _commit_and_serialize(db, target)
