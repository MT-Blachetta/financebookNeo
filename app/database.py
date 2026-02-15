import os
import logging
from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import text, inspect

logger = logging.getLogger(__name__)

# If no DATABASE_URL environment variable is present we fall back to a local
# on-disk SQLite database. Developers can override this to point at
# "postgresql+psycopg2://username:password@host/databaseName" or similar.
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./financebook.db")

# SQLite requires an extra flag when used in a multi-threaded environment like
# Uvicorn's default worker model. For all other dialects this dictionary
# remains empty.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# "echo=False" keeps the SQL log clean in production, flip to 'True' when debugging.
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables() -> None:
    """Create all tables from SQLModel metadata, then run schema migrations."""
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def _run_migrations() -> None:
    """Add missing columns to existing tables (lightweight DDL migration).

    This handles the schema evolution when `user_id` columns are added to
    tables that already contain data from the pre-multi-user era.
    """
    inspector = inspect(engine)

    # Map of (table_name, column_name) → SQL to execute if column is missing
    migrations: list[tuple[str, str, str]] = [
        ("categorytype", "user_id",
         "ALTER TABLE categorytype ADD COLUMN user_id INTEGER REFERENCES \"user\"(id)"),
        ("category", "user_id",
         "ALTER TABLE category ADD COLUMN user_id INTEGER REFERENCES \"user\"(id)"),
        ("recipient", "user_id",
         "ALTER TABLE recipient ADD COLUMN user_id INTEGER REFERENCES \"user\"(id)"),
        ("paymentitem", "user_id",
         "ALTER TABLE paymentitem ADD COLUMN user_id INTEGER REFERENCES \"user\"(id)"),
    ]

    with engine.begin() as conn:
        for table_name, column_name, ddl in migrations:
            if not inspector.has_table(table_name):
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
            if column_name not in existing_columns:
                logger.info(f"Migration: adding {column_name} to {table_name}")
                conn.execute(text(ddl))


def get_session():
    with Session(engine) as session:
        yield session
