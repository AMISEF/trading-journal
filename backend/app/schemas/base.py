"""Shared Pydantic base model.

The whole API speaks camelCase on the wire (to match the frontend) while the
Python code stays snake_case. We achieve that with an ``alias_generator`` that
converts snake_case -> camelCase, plus ``populate_by_name`` so we can still
construct models using the snake_case attribute names internally.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base class: serialises to camelCase, accepts both camelCase and snake_case."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,  # allow building from ORM objects
    )
