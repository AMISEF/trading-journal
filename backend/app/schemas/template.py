"""Pydantic schemas for checklist and reason templates."""

from typing import Any

from pydantic import Field

from app.schemas.base import CamelModel


class ChecklistIn(CamelModel):
    title: str
    # items = [{id, text}]
    items: list[dict[str, Any]] = Field(default_factory=list)


class ChecklistOut(CamelModel):
    id: int
    title: str
    items: list[dict[str, Any]] = Field(default_factory=list)


class ReasonIn(CamelModel):
    kind: str  # entry | exit
    text: str


class ReasonOut(CamelModel):
    id: int
    kind: str
    text: str
