# FinanceBook — Multi-User Authentication & Admin Panel

> **Implementation Date:** 2026-02-15
> **Version:** 0.2.0
> **Status:** Implemented (uncommitted)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture & Security Stack](#2-architecture--security-stack)
3. [New Dependencies](#3-new-dependencies)
4. [Database Changes](#4-database-changes)
5. [Configuration & Environment Variables](#5-configuration--environment-variables)
6. [Default Admin Account](#6-default-admin-account)
7. [Authentication API Endpoints](#7-authentication-api-endpoints)
8. [Admin API Endpoints](#8-admin-api-endpoints)
9. [Admin Web Panel](#9-admin-web-panel)
10. [Data Isolation (Multi-Tenancy)](#10-data-isolation-multi-tenancy)
11. [Schema Migration (Existing Databases)](#11-schema-migration-existing-databases)
12. [Files Changed & Added](#12-files-changed--added)
13. [User Instructions — Quick Start](#13-user-instructions--quick-start)
14. [Security Considerations & Best Practices](#14-security-considerations--best-practices)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Overview

FinanceBook has been upgraded from a **single-user** application to a **multi-user system** with full authentication and authorization. The key additions are:

- **User accounts** with secure password management (bcrypt hashing)
- **JWT-based API authentication** for all data endpoints
- **Role-based access control** with `User` and `Admin` roles
- **Per-user data isolation** — each user can only see and manage their own payment items, recipients, categories, and category types
- **Admin web panel** — a server-side rendered (Jinja2) administration website for user management
- **Admin REST API** — programmatic user management endpoints for admin users
- **Automatic schema migration** — existing databases are upgraded seamlessly; pre-existing data is assigned to the default admin account

---

## 2. Architecture & Security Stack

### Authentication Flow

```
┌──────────────┐    POST /auth/login     ┌──────────────────┐
│   Frontend   │ ──── (username+pw) ────►│  FastAPI Backend  │
│   (React)    │                         │                   │
│              │ ◄── JWT access_token ───│  ✓ Verify bcrypt  │
│              │                         │  ✓ Issue JWT      │
│              │    GET /payment-items   │                   │
│              │ ── Authorization:       │  ✓ Validate JWT   │
│              │    Bearer <token> ─────►│  ✓ Scope to user  │
└──────────────┘                         └──────────────────┘
```

### Security Components

| Layer                | Technology                | Details                                                              |
|----------------------|---------------------------|----------------------------------------------------------------------|
| **Password Hashing** | `bcrypt` (v4.0+)          | Adaptive cost factor, automatic salting. Passwords are **never** stored in plaintext. |
| **JWT Tokens**       | `python-jose` (HS256)     | Signed with a symmetric secret key from environment. 30-minute expiry by default. |
| **OAuth2 Flow**      | FastAPI `OAuth2PasswordBearer` | Standard Bearer token flow, compatible with Swagger UI `/docs`.      |
| **Admin Sessions**   | `itsdangerous` (signed cookies) | Server-side session cookies for the admin web panel. 1-hour max age. |

### Dependency Chain (FastAPI)

Two injectable dependencies gate access throughout the application:

```python
from app.auth import get_current_user, get_current_admin

# Any authenticated user
@app.get("/protected")
def route(user: User = Depends(get_current_user)):
    ...

# Admin only
@app.get("/admin-only")
def route(admin: User = Depends(get_current_admin)):
    ...
```

- **`get_current_user`** — Extracts and validates the JWT from the `Authorization: Bearer <token>` header. Returns the `User` record. Raises `401` if invalid/expired, `403` if the account is deactivated.
- **`get_current_admin`** — Calls `get_current_user` first, then additionally checks `user.is_admin == True`. Raises `403` if not an admin.

---

## 3. New Dependencies

The following packages were added to `requirements.txt`:

| Package                       | Purpose                                      |
|-------------------------------|----------------------------------------------|
| `python-jose[cryptography]>=3.3.0` | JWT creation and verification (HS256)        |
| `bcrypt>=4.0.0`               | Secure password hashing                      |
| `jinja2>=3.1.0`               | Server-side HTML templating for admin panel  |
| `itsdangerous>=2.1.0`         | Signed cookie sessions for admin web panel   |

Install all dependencies:

```bash
pip install -r requirements.txt
```

---

## 4. Database Changes

### New Table: `user`

| Column            | Type          | Constraints               | Description                             |
|-------------------|---------------|---------------------------|-----------------------------------------|
| `id`              | `INTEGER`     | `PRIMARY KEY`             | Auto-incremented user ID                |
| `username`        | `VARCHAR(50)` | `UNIQUE`, `NOT NULL`      | Login username                          |
| `hashed_password` | `TEXT`         | `NOT NULL`                | bcrypt hash                              |
| `surname`         | `VARCHAR(100)`| `NOT NULL`                | Last name                               |
| `prename`         | `VARCHAR(100)`| `NOT NULL`                | First name                              |
| `birth_date`      | `DATE`        | Nullable                  | Date of birth                           |
| `phone`           | `VARCHAR(30)` | Nullable                  | Phone number                            |
| `road`            | `VARCHAR(200)`| Nullable                  | Street name                             |
| `house_number`    | `VARCHAR(20)` | Nullable                  | House number                            |
| `region`          | `VARCHAR(100)`| Nullable                  | Region                                  |
| `postal`          | `VARCHAR(20)` | Nullable                  | Postal code                             |
| `city`            | `VARCHAR(100)`| Nullable                  | City                                    |
| `state`           | `VARCHAR(100)`| Nullable                  | State / Province                        |
| `is_admin`        | `BOOLEAN`     | Default: `False`          | Grants access to admin panel & API      |
| `is_active`       | `BOOLEAN`     | Default: `True`           | `False` = account deactivated           |
| `created_at`      | `DATETIME`    | Default: `utcnow()`       | Account creation timestamp              |

### Added Column: `user_id` (Foreign Key → `user.id`)

The following existing tables received a new `user_id` column to enable per-user data isolation:

- **`paymentitem`** — each payment item belongs to a user
- **`recipient`** — each recipient belongs to a user
- **`category`** — each category belongs to a user
- **`categorytype`** — each category type belongs to a user

---

## 5. Configuration & Environment Variables

### `.env` File

| Variable               | Required | Default              | Description                                        |
|------------------------|----------|----------------------|----------------------------------------------------|
| `DATABASE_URL`         | No       | `sqlite:///./financebook.db` | Database connection string (PostgreSQL recommended) |
| `JWT_SECRET_KEY`       | **Recommended** | Auto-generated (random hex) | Secret key for signing JWT tokens. **Set this in production!** |
| `ADMIN_DEFAULT_PASSWORD` | No     | `admin`              | Initial password for the auto-created admin account |

### Example `.env`

```env
DATABASE_URL=postgresql+psycopg2://yourself:secretPassword@localhost/financebook
JWT_SECRET_KEY=your-very-long-random-secret-key-here
ADMIN_DEFAULT_PASSWORD=MySecureAdminPassword123
```

> ⚠️ **Important:** If `JWT_SECRET_KEY` is not set, a random key is generated at startup. This means **all tokens are invalidated on every server restart** in development. Always set this variable in production.

---

## 6. Default Admin Account

On first startup, the application automatically creates a default admin account:

| Field       | Value                                |
|-------------|--------------------------------------|
| **Username**| `admin`                              |
| **Password**| Value of `ADMIN_DEFAULT_PASSWORD` env var, or `admin` if unset |
| **Name**    | System Administrator                 |
| **Role**    | Admin                                |
| **Status**  | Active                               |

### ⚠️ First-Time Setup — Change the Default Password!

1. Start the application
2. Navigate to the **Admin Panel**: `http://localhost:8000/admin/login`
3. Log in with `admin` / `admin` (or your custom default password)
4. Go to **Users** → click **Edit** on the admin user
5. Set a new secure password in the **Security** section
6. Click **Save Changes**

---

## 7. Authentication API Endpoints

All endpoints are accessible via `http://localhost:8000`. Full interactive documentation is available at `http://localhost:8000/docs` (Swagger UI).

### `POST /auth/login` — Authenticate & Get Token

**Request** (form-encoded):
```
Content-Type: application/x-www-form-urlencoded

username=john&password=secret123
```

**Response** (`200 OK`):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

**Errors:**
- `401` — Incorrect username or password
- `403` — Account is deactivated

**Usage:** Include the token in subsequent requests:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

> **Token Expiry:** 30 minutes. After expiry, the user must log in again.

---

### `POST /auth/register` — Register New User

**Request** (JSON):
```json
{
  "username": "johndoe",
  "password": "secret123",
  "surname": "Doe",
  "prename": "John",
  "birth_date": "1990-05-15",
  "phone": "+49 123 456789",
  "road": "Main Street",
  "house_number": "42",
  "region": "Bavaria",
  "postal": "80331",
  "city": "Munich",
  "state": "Germany"
}
```

**Required fields:** `username`, `password` (min. 6 chars), `surname`, `prename`
**Optional fields:** `birth_date`, `phone`, `road`, `house_number`, `region`, `postal`, `city`, `state`

**Response** (`200 OK`): Returns `UserRead` schema (never exposes password hash).

**Side effects:** Automatically creates a `standard` category type and an `UNCLASSIFIED` default category for the new user.

**Errors:**
- `400` — Username empty, username taken, password too short (< 6 chars)

---

### `GET /auth/me` — Get Current User Profile

**Headers:** `Authorization: Bearer <token>`

**Response:** Returns the authenticated user's profile (`UserRead` schema).

---

### `PUT /auth/me` — Update Current User Profile

**Headers:** `Authorization: Bearer <token>`

**Request** (JSON, all fields optional):
```json
{
  "surname": "Updated Name",
  "password": "newSecurePassword"
}
```

**Response:** Returns the updated user profile.

---

## 8. Admin API Endpoints

These endpoints require an **admin** JWT token (`is_admin == True`).

| Method   | Endpoint                       | Description                            |
|----------|--------------------------------|----------------------------------------|
| `GET`    | `/admin/api/users`             | List all users                         |
| `GET`    | `/admin/api/users/{user_id}`   | Get a specific user by ID              |
| `PUT`    | `/admin/api/users/{user_id}`   | Update a user (profile + password)     |
| `DELETE` | `/admin/api/users/{user_id}`   | Deactivate a user (soft delete)        |

### Key Behaviors

- **Deactivation** (`DELETE`): Sets `is_active = False`. Does **not** delete the user or their data. Deactivated users cannot log in. An admin cannot deactivate themselves.
- **Password Reset** (`PUT`): Include `"password": "newPassword"` in the update payload to reset a user's password.

---

## 9. Admin Web Panel

The admin web panel is a **server-side rendered** (SSR) website using Jinja2 templates with a dark-themed UI. It runs on the same server as the API.

### Access

- **URL:** `http://localhost:8000/admin/login`
- **Authentication:** Session-based (signed cookies via `itsdangerous`), separate from JWT tokens
- **Session duration:** 1 hour

### Pages

| URL                         | Page           | Description                                      |
|-----------------------------|----------------|--------------------------------------------------|
| `/admin/login`              | Login          | Admin authentication form                        |
| `/admin/dashboard`          | Dashboard      | Overview with statistics (users, payments, etc.) |
| `/admin/users`              | User List      | Searchable table of all registered users         |
| `/admin/users/{id}`         | User Detail    | Edit user profile, reset password, toggle status |
| `/admin/logout`             | Logout         | Clears session cookie, redirects to login        |

### Dashboard Features

The dashboard displays real-time statistics:
- **Total Users** — Count of all registered users
- **Active Users** — Users with `is_active == True`
- **Payment Items** — Total across all users
- **Recipients** — Total across all users
- **Categories** — Total across all users
- **Quick Actions** — Links to User Management and API Documentation

### User Management Features

From the **User Detail** page (`/admin/users/{id}`), an admin can:

1. **View account info** — Creation date, role (Admin/User), status (Active/Inactive)
2. **View data statistics** — Number of payment items, recipients, and categories belonging to the user
3. **Edit personal information** — First name, last name, date of birth, phone number
4. **Edit address** — Street, house number, postal code, city, region, state
5. **Reset password** — Set a new password (minimum 6 characters); leave blank to keep current
6. **Toggle active status** — Activate/deactivate a user's checkbox in the edit form
7. **Quick activate/deactivate button** — One-click toggle in the sidebar (with confirmation dialog)

> **Safety:** An admin **cannot deactivate their own account** through the toggle button.

### User Search

The user list page (`/admin/users`) supports searching by:
- Username
- Surname
- First name (prename)

---

## 10. Data Isolation (Multi-Tenancy)

All data endpoints are **scoped to the authenticated user**. A user can only access their own data:

### Protected Entities

| Entity          | Isolation Method                                                                 |
|-----------------|---------------------------------------------------------------------------------|
| **Payment Items** | `WHERE PaymentItem.user_id == current_user.id` on all queries                   |
| **Recipients**    | `WHERE Recipient.user_id == current_user.id` on all queries                     |
| **Categories**    | `WHERE Category.user_id == current_user.id` on all queries                      |
| **Category Types**| `WHERE CategoryType.user_id == current_user.id` on all queries                  |
| **Invoices**      | Ownership checked via parent `PaymentItem.user_id` before upload/download/delete |
| **CSV Import**    | All imported records are assigned `user_id = current_user.id`                    |

### Ownership Enforcement

Every data mutation endpoint performs ownership checks:

- **Create:** `user_id` is automatically set from the JWT — users cannot create data for other users
- **Read:** Queries are filtered by `user_id`; returns `403 Forbidden` if attempting to access another user's record
- **Update:** Returns `403 Forbidden` if the record does not belong to the authenticated user
- **Delete:** Returns `403 Forbidden` if the record does not belong to the authenticated user

### Cross-User Validation

When creating/updating payment items, the system also validates that:
- Referenced **recipients** belong to the current user
- Referenced **categories** belong to the current user
- The **standard category type** is resolved per-user

---

## 11. Schema Migration (Existing Databases)

The application handles existing databases gracefully:

### Automatic Column Migration (`database.py`)

On startup, the `_run_migrations()` function checks for and adds missing `user_id` columns to:
- `paymentitem`
- `recipient`
- `category`
- `categorytype`

This uses lightweight DDL (`ALTER TABLE ... ADD COLUMN`) and is safe to run multiple times (idempotent).

### Orphaned Record Assignment (`main.py`)

After the default admin user is created/verified, `_assign_orphaned_records()` runs:
- Finds all records in `PaymentItem`, `Recipient`, `CategoryType`, and `Category` where `user_id IS NULL`
- Assigns them to the admin user's `id`
- This is a **one-time migration** that ensures pre-existing data remains accessible

### Migration Safety

- Migrations only run if columns are actually missing (checked via `SQLAlchemy.inspect`)
- No data is deleted or modified beyond adding `user_id` references
- The migration is committed within a single transaction

---

## 12. Files Changed & Added

### Modified Files

| File                | Changes                                                                                     |
|---------------------|---------------------------------------------------------------------------------------------|
| `app/main.py`       | +558 lines — Auth endpoints, admin API, user ownership on all CRUD, admin router inclusion   |
| `app/models.py`     | +105 lines — `User`, `UserCreate`, `UserRead`, `UserUpdate` schemas; `user_id` on all entities |
| `app/database.py`   | +36 lines — `_run_migrations()` for adding `user_id` columns to existing tables              |
| `app/constants.py`  | +11 lines — Field length constants for user model (`MAX_USERNAME_LENGTH`, etc.)               |
| `requirements.txt`  | +4 lines — `python-jose`, `bcrypt`, `jinja2`, `itsdangerous`                                 |

### New Files

| File                              | Description                                                         |
|-----------------------------------|---------------------------------------------------------------------|
| `app/auth.py`                     | Authentication module: password hashing, JWT, FastAPI dependencies   |
| `app/admin.py`                    | Admin web panel router: login, dashboard, user CRUD, session mgmt   |
| `app/static/admin.css`            | Dark-themed CSS for the admin web panel (562 lines)                  |
| `app/templates/base.html`         | Base Jinja2 template with navigation and footer                     |
| `app/templates/login.html`        | Admin login form                                                    |
| `app/templates/dashboard.html`    | Admin dashboard with statistics and quick actions                   |
| `app/templates/users.html`        | User list with search and data table                                |
| `app/templates/user_detail.html`  | User edit form with personal info, address, security, and status    |

---

## 13. User Instructions — Quick Start

### Starting the Application

```bash
cd financebookNeo
./run_app.sh
```

Or manually:

```bash
# Activate virtual environment
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# In a separate terminal, start the frontend
cd frontend && npm run dev
```

### For API Users (Frontend / Mobile / Scripts)

#### Step 1: Register (or use the default admin)

```bash
# Register a new user
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "secret123",
    "surname": "Doe",
    "prename": "John"
  }'
```

#### Step 2: Log In & Get Token

```bash
# Log in
curl -X POST http://localhost:8000/auth/login \
  -d "username=johndoe&password=secret123"

# Response:
# {"access_token": "eyJhbG...", "token_type": "bearer"}
```

#### Step 3: Use the Token

```bash
# Example: list your payment items
curl http://localhost:8000/payment-items \
  -H "Authorization: Bearer eyJhbG..."
```

#### Step 4: Use Swagger UI

Open `http://localhost:8000/docs` in your browser, click the **Authorize** button (🔓), enter your token, and test endpoints interactively.

### For Administrators

#### Access the Admin Panel

1. Open `http://localhost:8000/admin/login`
2. Log in with your admin credentials (default: `admin` / `admin`)
3. You'll be redirected to the **Dashboard**

#### Create a New User (via Admin Panel)

Currently, new users are created through the `/auth/register` API endpoint. From the admin panel, you can:
- View all registered users
- Edit user details and addresses
- Reset user passwords
- Activate or deactivate user accounts

#### Deactivate a User

1. Go to **Users** → click **Edit** on the target user
2. Either:
   - Uncheck the **"Account is active"** checkbox and click **Save Changes**
   - Or click the **"Deactivate Account"** button in the sidebar
3. The user will immediately lose access and cannot log in

#### Reactivate a User

1. Go to **Users** → click **Edit** on the deactivated user (shown with dimmed row)
2. Either:
   - Check the **"Account is active"** checkbox and click **Save Changes**
   - Or click the **"Activate Account"** button in the sidebar

#### Reset a User's Password

1. Go to **Users** → click **Edit** on the target user
2. In the **Security** section, enter the new password (minimum 6 characters)
3. Click **Save Changes**
4. The user's old password is immediately invalidated

---

## 14. Security Considerations & Best Practices

### Production Deployment Checklist

- [ ] **Set `JWT_SECRET_KEY`** in `.env` — Use a long, random string (64+ characters). Never use the default.
  ```bash
  # Generate a strong key:
  python3 -c "import secrets; print(secrets.token_hex(64))"
  ```
- [ ] **Change the default admin password** — Log in and change it immediately after first start
- [ ] **Set `ADMIN_DEFAULT_PASSWORD`** in `.env` — Before the first deployment
- [ ] **Use HTTPS** — JWT tokens are sent in plain HTTP headers; without TLS they can be intercepted
- [ ] **Set `httponly` and `secure` flags on cookies** — The admin session cookie already has `httponly=True` and `samesite=lax`. For production over HTTPS, also add `secure=True` in `admin.py`.
- [ ] **Database security** — Use a strong password for the PostgreSQL connection string
- [ ] **Keep dependencies updated** — Especially `bcrypt`, `python-jose`, and `fastapi`

### Password Policy

- Minimum length: **6 characters** (enforced on registration, profile update, and admin password reset)
- Hashing algorithm: **bcrypt** with automatic salting and adaptive cost factor
- Passwords are **never** logged, returned in API responses, or stored in plaintext

### Token Security

- Algorithm: **HS256** (symmetric)
- Default expiry: **30 minutes** (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES` in `auth.py`)
- Token payload contains only: `sub` (username) and `exp` (expiry timestamp)
- Invalid/expired tokens return `401 Unauthorized`

### Admin Session Security

- Signed with `itsdangerous.URLSafeTimedSerializer` using the same `JWT_SECRET_KEY`
- Cookie settings: `httponly=True`, `samesite=lax`, `max_age=3600` (1 hour)
- Invalid/expired sessions redirect to `/admin/login`

---

## 15. Troubleshooting

### "Could not validate credentials" (401)

- The JWT token has expired (30-minute lifetime). Log in again.
- The token is malformed or was issued with a different `JWT_SECRET_KEY` (e.g., after server restart without a fixed key).
- **Fix:** Set `JWT_SECRET_KEY` in `.env` so tokens survive restarts.

### "User account is deactivated" (403)

- An admin has deactivated this account via the admin panel or API.
- **Fix:** Ask an admin to reactivate the account at `/admin/users/{id}`.

### "Admin privileges required" (403)

- The authenticated user does not have `is_admin == True`.
- **Fix:** An existing admin must promote the user (currently requires direct database access):
  ```sql
  UPDATE "user" SET is_admin = TRUE WHERE username = 'target_username';
  ```

### Admin panel shows redirect loop

- The admin session cookie may be corrupted or expired.
- **Fix:** Clear browser cookies for the site, or navigate directly to `/admin/login`.

### Existing data disappeared after migration

- Pre-existing data (without `user_id`) should have been automatically assigned to the admin account.
- **Check:** Log in as admin and verify the data is there.
- **Manual fix** (if migration didn't run):
  ```sql
  UPDATE paymentitem SET user_id = 1 WHERE user_id IS NULL;
  UPDATE recipient SET user_id = 1 WHERE user_id IS NULL;
  UPDATE category SET user_id = 1 WHERE user_id IS NULL;
  UPDATE categorytype SET user_id = 1 WHERE user_id IS NULL;
  ```

### Frontend not sending authentication tokens

- The React frontend does **not yet include authentication integration**. Currently, the auth system is fully functional on the **backend API** and **admin web panel** only.
- Frontend login/registration UI integration is planned for a future iteration.
- In the meantime, API calls can be tested via:
  - **Swagger UI** at `http://localhost:8000/docs` (click 🔓 Authorize)
  - **cURL** or any HTTP client (Postman, Insomnia, etc.)

---

*Generated on 2026-02-15. For API details, see the interactive documentation at `http://localhost:8000/docs`.*
