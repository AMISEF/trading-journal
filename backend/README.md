# Trading Journal — Backend (FastAPI)

Backend API for the Crypto Smart trading journal. Python 3.11 + FastAPI (async)
+ SQLAlchemy 2 (async) + PostgreSQL.

## Quick start (local)

```bash
cd backend

# 1) Create a virtualenv and install dependencies
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt

# 2) Configure environment
cp .env.example .env
# edit .env: set DATABASE_URL and a real SECRET_KEY

# 3) Make sure PostgreSQL is running and the database exists, e.g.:
#    createdb trading_journal
#    (the tables are created automatically on first startup)

# 4) Run the dev server
./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

API docs: http://127.0.0.1:8001/docs

## Run the tests

```bash
./venv/bin/python -m pytest app/tests -q
```

## Production (PM2)

```bash
pm2 start ecosystem.config.js   # runs uvicorn on 127.0.0.1:8001
pm2 save
```

## Notes

- All routes are under `/api`. JSON is camelCase on the wire.
- Tables are created on startup (`Base.metadata.create_all`) — no Alembic
  migrations are required for Phase 1. The `alembic/` folder is a placeholder.
- The first user to register becomes `ADMIN`; everyone else is `TRADER`.
- The calc engine lives in `app/services/calc.py` and is pure (no DB/network),
  fully covered by `app/tests/test_calc.py`.
- Market data (Toobit, Tabdeal) is proxied with a ~5s in-memory cache and falls
  back gracefully when the upstream APIs are unreachable.
- Importing `app.main` does NOT require a running database; the DB is only
  touched in the startup event.
```
