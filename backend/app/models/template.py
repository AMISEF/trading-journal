"""Database models for reusable templates: checklists and reasons."""

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChecklistTemplate(Base):
    __tablename__ = "checklist_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    # items is a JSON list like [{"id": "...", "text": "..."}]
    items: Mapped[list] = mapped_column(JSON, default=list)


class ReasonTemplate(Base):
    __tablename__ = "reason_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # "entry" | "exit"
    text: Mapped[str] = mapped_column(Text)
