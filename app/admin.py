"""
Admin website router for FinanceBook.

Serves Jinja2 HTML templates for the administration panel, secured by
session-based authentication (itsdangerous signed cookies).

The admin panel allows:
  • Viewing all registered users
  • Editing user details (name, address, phone, etc.)
  • Resetting user passwords
  • Activating / deactivating user accounts
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from sqlmodel import Session, select

from app.auth import hash_password, verify_password, SECRET_KEY
from app.database import get_session
from app.models import User, PaymentItem, Recipient, Category, CategoryType

# ─── Configuration ───────────────────────────────────────────────────

TEMPLATES_DIR = Path(__file__).parent / "templates"
TEMPLATES_DIR.mkdir(exist_ok=True)

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Session cookie signer (uses the same secret as JWT for simplicity)
_signer = URLSafeTimedSerializer(SECRET_KEY)
SESSION_COOKIE = "admin_session"
SESSION_MAX_AGE = 3600  # 1 hour

admin_router = APIRouter(prefix="/admin", tags=["Admin Website"])


# ─── Helpers ─────────────────────────────────────────────────────────

def _get_admin_username(request: Request) -> Optional[str]:
    """Extract and verify the admin session cookie. Returns username or None."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    try:
        username = _signer.loads(token, max_age=SESSION_MAX_AGE)
        return username
    except (BadSignature, SignatureExpired):
        return None


def _require_admin(request: Request, session: Session) -> User:
    """Verify admin session or redirect to login."""
    username = _get_admin_username(request)
    if not username:
        raise HTTPException(status_code=302, headers={"Location": "/admin/login"})
    user = session.exec(select(User).where(User.username == username)).first()
    if not user or not user.is_admin or not user.is_active:
        raise HTTPException(status_code=302, headers={"Location": "/admin/login"})
    return user


# ─── Routes ──────────────────────────────────────────────────────────

@admin_router.get("/login", response_class=HTMLResponse)
def admin_login_page(request: Request):
    """Render the admin login page."""
    # If already logged in, redirect to dashboard
    if _get_admin_username(request):
        return RedirectResponse(url="/admin/dashboard", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@admin_router.post("/login", response_class=HTMLResponse)
def admin_login_submit(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    session: Session = Depends(get_session),
):
    """Process the admin login form."""
    user = session.exec(select(User).where(User.username == username)).first()
    if not user or not verify_password(password, user.hashed_password):
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Invalid username or password"},
        )
    if not user.is_admin:
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "You do not have admin privileges"},
        )
    if not user.is_active:
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Your account has been deactivated"},
        )

    # Set signed session cookie
    token = _signer.dumps(user.username)
    response = RedirectResponse(url="/admin/dashboard", status_code=302)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
    )
    return response


@admin_router.get("/logout")
def admin_logout():
    """Clear the admin session and redirect to login."""
    response = RedirectResponse(url="/admin/login", status_code=302)
    response.delete_cookie(SESSION_COOKIE)
    return response


@admin_router.get("/dashboard", response_class=HTMLResponse)
def admin_dashboard(
    request: Request,
    session: Session = Depends(get_session),
):
    """Admin dashboard with overview statistics."""
    admin = _require_admin(request, session)
    
    total_users = len(session.exec(select(User)).all())
    active_users = len(session.exec(select(User).where(User.is_active == True)).all())
    total_payments = len(session.exec(select(PaymentItem)).all())
    total_recipients = len(session.exec(select(Recipient)).all())
    total_categories = len(session.exec(select(Category)).all())

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "admin": admin,
        "total_users": total_users,
        "active_users": active_users,
        "total_payments": total_payments,
        "total_recipients": total_recipients,
        "total_categories": total_categories,
    })


@admin_router.get("/users", response_class=HTMLResponse)
def admin_users_list(
    request: Request,
    search: str = "",
    session: Session = Depends(get_session),
):
    """List all users with optional search."""
    admin = _require_admin(request, session)

    query = select(User)
    if search:
        query = query.where(
            (User.username.contains(search))
            | (User.surname.contains(search))
            | (User.prename.contains(search))
        )
    users = session.exec(query.order_by(User.id)).all()

    return templates.TemplateResponse("users.html", {
        "request": request,
        "admin": admin,
        "users": users,
        "search": search,
    })


@admin_router.get("/users/{user_id}", response_class=HTMLResponse)
def admin_user_detail(
    user_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    """User detail / edit form."""
    admin = _require_admin(request, session)
    
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Count user's data
    payment_count = len(session.exec(
        select(PaymentItem).where(PaymentItem.user_id == user_id)
    ).all())
    recipient_count = len(session.exec(
        select(Recipient).where(Recipient.user_id == user_id)
    ).all())
    category_count = len(session.exec(
        select(Category).where(Category.user_id == user_id)
    ).all())

    return templates.TemplateResponse("user_detail.html", {
        "request": request,
        "admin": admin,
        "user": user,
        "payment_count": payment_count,
        "recipient_count": recipient_count,
        "category_count": category_count,
        "success": None,
        "error": None,
    })


@admin_router.post("/users/{user_id}", response_class=HTMLResponse)
def admin_user_update(
    user_id: int,
    request: Request,
    surname: str = Form(...),
    prename: str = Form(...),
    phone: str = Form(""),
    birth_date: str = Form(""),
    road: str = Form(""),
    house_number: str = Form(""),
    region: str = Form(""),
    postal: str = Form(""),
    city: str = Form(""),
    state: str = Form(""),
    new_password: str = Form(""),
    is_active: str = Form("on"),
    session: Session = Depends(get_session),
):
    """Save user changes from the detail form."""
    admin = _require_admin(request, session)
    
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.surname = surname.strip()
    user.prename = prename.strip()
    user.phone = phone.strip() or None
    user.road = road.strip() or None
    user.house_number = house_number.strip() or None
    user.region = region.strip() or None
    user.postal = postal.strip() or None
    user.city = city.strip() or None
    user.state = state.strip() or None
    user.is_active = is_active == "on"

    if birth_date.strip():
        try:
            from datetime import date as date_type
            user.birth_date = date_type.fromisoformat(birth_date.strip())
        except ValueError:
            pass  # keep existing value

    error = None
    if new_password.strip():
        if len(new_password.strip()) < 6:
            error = "Password must be at least 6 characters"
        else:
            user.hashed_password = hash_password(new_password.strip())

    if not error:
        session.add(user)
        session.commit()
        session.refresh(user)

    # Count user's data for the template
    payment_count = len(session.exec(
        select(PaymentItem).where(PaymentItem.user_id == user_id)
    ).all())
    recipient_count = len(session.exec(
        select(Recipient).where(Recipient.user_id == user_id)
    ).all())
    category_count = len(session.exec(
        select(Category).where(Category.user_id == user_id)
    ).all())

    return templates.TemplateResponse("user_detail.html", {
        "request": request,
        "admin": admin,
        "user": user,
        "payment_count": payment_count,
        "recipient_count": recipient_count,
        "category_count": category_count,
        "success": "User updated successfully" if not error else None,
        "error": error,
    })


@admin_router.post("/users/{user_id}/deactivate", response_class=HTMLResponse)
def admin_user_toggle_active(
    user_id: int,
    request: Request,
    session: Session = Depends(get_session),
):
    """Toggle user active status."""
    admin = _require_admin(request, session)
    
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        return RedirectResponse(url=f"/admin/users/{user_id}?error=Cannot+deactivate+yourself", status_code=302)

    user.is_active = not user.is_active
    session.add(user)
    session.commit()

    return RedirectResponse(url=f"/admin/users/{user_id}", status_code=302)
