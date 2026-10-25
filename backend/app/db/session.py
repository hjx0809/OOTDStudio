"""SQLAlchemy engine, session factory and request-scoped database dependency."""

from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()
if settings.database_url.startswith("sqlite"):
    Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(
        parents=True, exist_ok=True
    )

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _drop_retired_columns() -> None:
    """Drop columns left behind by removed features on existing SQLite files.

    ``create_all`` only creates missing tables, so a database created while the
    background feature existed keeps NOT NULL columns that new inserts no
    longer populate.
    """
    if not settings.database_url.startswith("sqlite"):
        return
    retired = {
        "recommendations": ("background_mode", "background_prompt"),
        "outfits": ("background_mode", "background_prompt"),
    }
    with engine.begin() as connection:
        for table, columns in retired.items():
            present = {
                row[1]
                for row in connection.exec_driver_sql(f"PRAGMA table_info({table})")
            }
            for column in columns:
                if column in present:
                    connection.exec_driver_sql(
                        f"ALTER TABLE {table} DROP COLUMN {column}"
                    )


def init_db() -> None:
    from app.db import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _drop_retired_columns()
