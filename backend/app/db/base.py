"""Declarative base class for all database models.

Every model (User, Trade, etc.) inherits from Base so SQLAlchemy knows
about it and can create the matching database tables.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
