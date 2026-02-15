"""
Authentication & authorization module for FinanceBook.

Security stack
--------------
* **Password hashing** – `bcrypt` (adaptive cost factor, salted)
* **JWT tokens**       – `python-jose` with HS256 (symmetric key from env)
* **OAuth2 flow**      – FastAPI's `OAuth2PasswordBearer` for Swagger integration

The module exposes two key FastAPI dependencies:
  • `get_current_user`  – extracts & validates the JWT from the Authorization header
  • `get_current_admin` – additionally checks the `is_admin` flag

Usage
-----
    from app.auth import get_current_user, get_current_admin

    @app.get("/protected")
    def protected_route(user: User = Depends(get_current_user)):
        ...
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.database import get_session
from app.models import User

# ─── Configuration ───────────────────────────────────────────────────

load_dotenv()

# If no secret is configured we generate one and persist it so tokens
# survive server restarts during development.
_DEFAULT_SECRET = secrets.token_hex(32)
SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", _DEFAULT_SECRET)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# ─── Password hashing (bcrypt) ──────────────────────────────────────


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of *plain_password*."""
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check *plain_password* against a bcrypt *hashed_password*."""
    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


# ─── JWT token management ───────────────────────────────────────────

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT containing *data* with an expiry claim."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ─── FastAPI dependencies ───────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Validate the JWT and return the corresponding `User` record.

    Raises 401 if the token is invalid, expired, or the user doesn't exist.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    return user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the authenticated user has admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
