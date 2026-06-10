"""Reusable template routes: checklists and entry/exit reasons."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.template import ChecklistTemplate, ReasonTemplate
from app.models.user import User
from app.schemas.template import ChecklistIn, ChecklistOut, ReasonIn, ReasonOut

# --- Checklists -----------------------------------------------------------
checklists_router = APIRouter(prefix="/api/checklists", tags=["checklists"])


@checklists_router.get("", response_model=list[ChecklistOut])
@checklists_router.get("/", response_model=list[ChecklistOut], include_in_schema=False)
async def list_checklists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ChecklistOut]:
    result = await db.execute(
        select(ChecklistTemplate).where(ChecklistTemplate.user_id == user.id)
    )
    return [ChecklistOut.model_validate(c) for c in result.scalars().all()]


@checklists_router.post("", response_model=ChecklistOut, status_code=status.HTTP_201_CREATED)
@checklists_router.post("/", response_model=ChecklistOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_checklist(
    body: ChecklistIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChecklistOut:
    item = ChecklistTemplate(user_id=user.id, title=body.title, items=body.items)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return ChecklistOut.model_validate(item)


@checklists_router.put("/{checklist_id}", response_model=ChecklistOut)
async def update_checklist(
    checklist_id: int,
    body: ChecklistIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChecklistOut:
    item = await db.get(ChecklistTemplate, checklist_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Checklist not found")
    item.title = body.title
    item.items = body.items
    await db.commit()
    await db.refresh(item)
    return ChecklistOut.model_validate(item)


@checklists_router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_checklist(
    checklist_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    item = await db.get(ChecklistTemplate, checklist_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Checklist not found")
    await db.delete(item)
    await db.commit()


# --- Reasons --------------------------------------------------------------
reasons_router = APIRouter(prefix="/api/reasons", tags=["reasons"])


@reasons_router.get("", response_model=list[ReasonOut])
@reasons_router.get("/", response_model=list[ReasonOut], include_in_schema=False)
async def list_reasons(
    kind: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReasonOut]:
    stmt = select(ReasonTemplate).where(ReasonTemplate.user_id == user.id)
    if kind:
        stmt = stmt.where(ReasonTemplate.kind == kind)
    result = await db.execute(stmt)
    return [ReasonOut.model_validate(r) for r in result.scalars().all()]


@reasons_router.post("", response_model=ReasonOut, status_code=status.HTTP_201_CREATED)
@reasons_router.post("/", response_model=ReasonOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_reason(
    body: ReasonIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReasonOut:
    item = ReasonTemplate(user_id=user.id, kind=body.kind, text=body.text)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return ReasonOut.model_validate(item)


@reasons_router.delete("/{reason_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_reason(
    reason_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    item = await db.get(ReasonTemplate, reason_id)
    if item is None or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="Reason not found")
    await db.delete(item)
    await db.commit()
