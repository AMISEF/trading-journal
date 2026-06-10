# Alembic (placeholder)

Phase 1 does not use migrations. The database tables are created automatically
on application startup via `Base.metadata.create_all` (see `app/db/session.py`
`init_db()`), which keeps setup simple for non-developers.

This folder is intentionally left as a placeholder for a future phase where
Alembic migrations may be introduced.
