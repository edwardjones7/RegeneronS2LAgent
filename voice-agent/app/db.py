"""Database engine and session helpers."""

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal: sessionmaker | None = None


def normalize_url(url: str) -> str:
    """Marketplace Postgres URLs say postgres://; SQLAlchemy wants the psycopg driver named."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def init_engine(url: str | None = None):
    """Create (or replace) the engine. Tests call this with an in-memory URL."""
    global _engine, _SessionLocal
    url = normalize_url(url or get_settings().database_url)
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_pre_ping": True}
    if get_settings().vercel and not url.startswith("sqlite"):
        from sqlalchemy.pool import NullPool

        kwargs["poolclass"] = NullPool  # serverless: let the provider's pooler (e.g. Neon) pool connections
    if url == "sqlite://":
        from sqlalchemy.pool import StaticPool

        kwargs["poolclass"] = StaticPool
    _engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(_engine, "connect")
        def _fk_on(dbapi_conn, _):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    from app import models  # noqa: F401  register tables

    Base.metadata.create_all(_engine)
    _add_missing_columns(_engine)
    return _engine


def _add_missing_columns(engine) -> None:
    """Tiny forward-only migration: add new nullable columns to existing tables."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in have:
                    ddl = col.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl}'))


def get_engine():
    if _engine is None:
        init_engine()
    return _engine


@contextmanager
def session_scope() -> Iterator[Session]:
    if _SessionLocal is None:
        init_engine()
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with session_scope() as s:
        yield s
