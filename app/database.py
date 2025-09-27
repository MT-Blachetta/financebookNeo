import os
from dotenv import load_dotenv
from sqlmodel import SQLModel, create_engine, Session

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
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
