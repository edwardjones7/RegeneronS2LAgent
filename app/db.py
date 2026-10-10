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


def init_engine(url: str | None = None):
    """Create (or replace) the engine. Tests call this with an in-memory URL."""
    global _engine, _SessionLocal
    url = url or get_settings().database_url
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
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
    return _engine


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
