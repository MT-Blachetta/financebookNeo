# FinanceBook - Private Finance Management Application

FinanceBook is a **multi-user** web application designed for managing private finances and cash flows. It features a modern React frontend with a FastAPI backend, **JWT-based authentication**, a **server-side rendered admin panel**, **configurable transaction fees**, and per-user data isolation — all built with state-of-the-art technologies and a clean, professional design.

## Core Features (Current Implementation)

*   **Authentication & User Management**:
    *   Multi-user system with secure registration and login.
    *   **bcrypt** password hashing with automatic salting (passwords are never stored in plaintext).
    *   **JWT (JSON Web Token)** authentication with HS256 signing and 30-minute token expiry.
    *   OAuth2-compatible Bearer token flow, fully integrated with Swagger UI (`/docs`).
    *   User self-service profile management (view and update personal details, change password).
    *   Default `admin` account auto-created on first startup with configurable initial password.
    *   User registration automatically provisions a `standard` category type and `UNCLASSIFIED` category.
*   **Admin Panel** (server-side rendered web UI):
    *   Accessible at `/admin/login` with session-based authentication (signed cookies, 1-hour sessions).
    *   **Dashboard** with real-time statistics: total users, active users, payment items, recipients, categories.
    *   **User management**: searchable user list, edit profiles, reset passwords, activate/deactivate accounts.
    *   **Transaction fee configuration**: interactive chart-based fee plan editor per user.
    *   Dark-themed, responsive design with modern CSS.
    *   See [`admin.md`](admin.md) for comprehensive admin documentation.
*   **Admin REST API**:
    *   `GET/PUT/DELETE /admin/api/users/{user_id}` — programmatic user management for admin users.
    *   `GET/PUT /admin/api/fee-plan/{user_id}` — read/save per-user fee plan configuration.
    *   `POST /admin/api/fee-plan/{user_id}/validate-formula` — validate a fee formula expression.
    *   Deactivation is a soft delete (sets `is_active = false`); no data is removed.
*   **Transaction Fees**:
    *   Configurable per-user fee plans with two modes: **Amount Table** (interval-based chart regression) and **Formula** (mathematical expression).
    *   Fees are automatically computed and applied when payment items are created, recomputed on update, and refunded on deletion.
    *   **Income** (positive amount): fee is subtracted from the stored value (e.g., 100€ → 99.99€ after 0.01€ fee).
    *   **Expenses** (negative amount): fee is subtracted, increasing the absolute value (e.g., -100€ → -100.01€ after 0.01€ fee).
    *   Fee is capped at 100% of the payment amount; fees below 0.01€ (after rounding) are not applied.
    *   Non-retroactive: fee plan changes only affect future transactions.
    *   All applied fees are recorded in `TransactionFeeRecord` for accurate refunds and recomputation.
*   **Per-User Data Isolation (Multi-Tenancy)**:
    *   Every data entity (payment items, recipients, categories, category types) belongs to a specific user via `user_id`.
    *   All API queries are scoped to the authenticated user — users cannot see or modify each other's data.
    *   Cross-entity ownership validation (e.g., a payment item's recipient must belong to the same user).
    *   Automatic migration: pre-existing data from the single-user era is assigned to the admin account on upgrade.
*   **Payment Item Management**:
    *   Create, Read, Update, Delete (CRUD) operations for payment items.
    *   Each item includes amount, date/time, periodicity flag, an optional recipient, multiple categories, and optional invoice attachments.
    *   Items are classified as "Income" (positive amount) or "Expense" (negative amount).
    *   **Periodic payment indicator**: Items marked as periodic display a blue circular-arrow icon inline next to the date label for quick visual identification.
    *   Support for invoice file uploads (PDF, DOCX, DOC, JPEG, PNG, GIF, BMP, TIFF) with 25MB size limit.
    *   Invoice files are automatically deleted when the associated payment item is deleted.
    *   Invoice download link positioned at the top-right corner of each payment item card.
*   **Statistics & Charts**:
    *   Dedicated `/statistics` page accessible via the navigation bar.
    *   **Account Balance Over Time**: Area/line chart showing the running cumulative balance with date-based X-axis and euro-formatted Y-axis (full number notation with dot separators, e.g. "3.300 €").
    *   **Income Distribution by Category**: Donut pie chart (green palette) showing income breakdown by assigned categories.
    *   **Expense Distribution by Category**: Donut pie chart (red palette) showing expense breakdown by assigned categories.
    *   Categories are resolved via `standard_category_id` lookup against the full category tree.
    *   Built with Recharts, a composable React charting library.
*   **Category Management**:
    *   Define custom "Category Types" (e.g., "Spending Area", "Payment Method").
    *   Create and edit nested categories under these types with unlimited depth.
    *   Each category may optionally have an icon (PNG, JPEG, GIF, BMP, SVG) uploaded via the API.
    *   A default `UNCLASSIFIED` category under the "standard" type is created on first run (per user).
    *   Support for one category per type per payment item (enforced validation).
    *   Hierarchical category filtering with automatic descendant expansion.
*   **Recipient Management**:
    *   Create, read, update recipients (persons or organizations).
    *   Each recipient has a name and optional address field.
    *   Name normalization and uniqueness validation (scoped per user).
*   **Filtering & Pagination**:
    *   Filter payment items by "All", "Incomes", or "Expenses".
    *   Filter by one or more categories with OR logic (items matching ANY selected category).
    *   The backend automatically expands selected categories to include all descendants.
    *   Single-row pagination bar anchored to the bottom of the viewport with custom blue arrow icons for Previous/Next navigation.
    *   Customizable items per page and "Show All" functionality.
*   **Data Import/Export**:
    *   CSV import functionality for bulk data import (imported data is assigned to the authenticated user).
    *   CSV export to download all payment data.
    *   Automatic creation of recipients and categories during import.
    *   Validation of CSV format, data types, and field lengths.
*   **User Interface**:
    *   Summary page listing all payment items, sorted by date, with running totals and category filters.
    *   Forms for adding and editing payment items with recipient and category selection.
    *   Success confirmation page after creating new items.
    *   Category type and category tree management pages.
    *   Navigation bar with quick links to Categories, Category Types, and Statistics.
    *   Responsive design with dark theme.
    *   Modern card-based payment item layout with category icons, recipient details, and inline periodic indicators.

## Project Structure

The project is divided into two main parts: a Python/FastAPI backend and a React/TypeScript frontend.

### Backend (`/app` directory)

*   **`main.py`**: Contains all FastAPI routes and business logic:
    *   **Authentication**: `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `PUT /auth/me`
    *   **Admin API**: `GET /admin/api/users`, `GET /admin/api/users/{user_id}`, `PUT /admin/api/users/{user_id}`, `DELETE /admin/api/users/{user_id}`
    *   **Payment Items**: `POST /payment-items`, `GET /payment-items`, `GET /payment-items/{item_id}`, `PUT /payment-items/{item_id}`, `DELETE /payment-items/{item_id}`
    *   **Categories**: `POST /categories`, `GET /categories`, `GET /categories/{category_id}`, `PUT /categories/{category_id}`, `GET /categories/{category_id}/tree`, `GET /categories/{category_id}/descendants`, `GET /categories/by-type/{type_id}`
    *   **Category Types**: `POST /category-types`, `GET /category-types`
    *   **Recipients**: `POST /recipients`, `GET /recipients`, `GET /recipients/{recipient_id}`, `PUT /recipients/{recipient_id}`
    *   **File Uploads**: `POST /uploadicon/`, `GET /download_static/{filename}`, `POST /upload-invoice/{payment_item_id}`, `GET /download-invoice/{payment_item_id}`, `DELETE /invoice/{payment_item_id}`
    *   **Data Import**: `POST /import-csv`
    *   All data endpoints require JWT authentication and enforce per-user data isolation.
    *   Includes comprehensive logging, validation, and error handling.
    *   Automatic initialization of default admin user, standard category type, and UNCLASSIFIED category.
    *   Automatic migration of orphaned records (pre-multi-user data) to the admin account.
*   **`auth.py`**: Authentication and authorization module:
    *   `hash_password()` / `verify_password()` — bcrypt password hashing.
    *   `create_access_token()` — JWT token creation with configurable expiry.
    *   `get_current_user` / `get_current_admin` — FastAPI injectable dependencies for route protection.
    *   OAuth2 password bearer scheme for Swagger UI integration.
*   **`admin.py`**: Admin web panel router (Jinja2 server-side rendering):
    *   Login/logout with signed session cookies (`itsdangerous`).
    *   Dashboard with application statistics.
    *   User list with search, user detail/edit forms, password reset, activate/deactivate.
    *   Fee configuration page and API endpoints (`GET/PUT /api/fee-plan/{user_id}`, `POST /api/fee-plan/{user_id}/validate-formula`).
*   **`fee_engine.py`**: Transaction fee computation engine:
    *   `compute_fee()` — computes the fee for a given payment amount based on the user's fee plan.
    *   `safe_eval_formula()` — AST-based safe evaluation of mathematical expressions (no `eval()`).
    *   `get_payment_frequency()` — calculates the fraction of a user's payments in a given amount range.
    *   `compute_regression_coefficients()` — polynomial regression with corner cases for 0, 1, and 2 points.
    *   `create_fee_record()`, `refund_fee_record()`, `recompute_fee_record()` — high-level CRUD helpers.
*   **`models.py`**: Defines SQLModel classes for database tables and API schemas:
    *   `User`, `UserCreate`, `UserRead`, `UserUpdate` — user account management.
    *   `PaymentItem`, `PaymentItemCreate`, `PaymentItemRead`, `PaymentItemUpdate`
    *   `Category`, `CategoryUpdate`, `CategoryType`
    *   `Recipient`, `RecipientUpdate`
    *   `PaymentItemCategoryLink` (many-to-many association table)
    *   `TransactionFeePlan` — per-user fee configuration (mode, formula, amount table, interval data).
    *   `TransactionFeeRecord` — fee applied to each payment item (fee amount, original amount).
    *   All data entities include a `user_id` foreign key for multi-tenancy.
    *   Includes comprehensive documentation and type hints.
*   **`database.py`**: Manages PostgreSQL database connection, table creation, and schema migrations using SQLModel.
    *   Automatic migration: adds `user_id` columns to existing tables on upgrade.
*   **`constants.py`**: Application-wide constants for validation (max lengths for text fields, including user-related fields).
*   **`/templates`**: Jinja2 HTML templates for the admin web panel (`base.html`, `login.html`, `dashboard.html`, `users.html`, `user_detail.html`, `fee_config.html`).
*   **`/static`**: Static assets for the admin panel (`admin.css` — dark-themed, responsive CSS).
*   **`.env`**: Environment configuration file containing `DATABASE_URL`, and optionally `JWT_SECRET_KEY` and `ADMIN_DEFAULT_PASSWORD`.
*   **`/invoices`**: Directory for storing uploaded invoice files (auto-created).

### Frontend (`/frontend` directory)

*   **`src/`**: Contains all React application source code.
    *   **`main.tsx`**: Entry point setting up React Query, React Router, and `AuthProvider`.
    *   **`App.tsx`**: Root component with authentication gating — unauthenticated users see only the login page; authenticated users see the full app with NavigationBar and routes.
    *   **`context/AuthContext.tsx`**: React Context providing global authentication state management:
        *   `login(username, password, rememberMe)` — authenticates via `POST /auth/login` and fetches user profile.
        *   `logout()` — clears stored tokens and React Query cache.
        *   "Stay logged in" — stores JWT in `localStorage` (persistent) or `sessionStorage` (tab-scoped).
        *   On mount, validates any stored token against `GET /auth/me`.
    *   **`api/hooks.ts`**: Custom React Query hooks for API interactions with automatic caching and refetching. Includes JWT auth interceptors that attach `Authorization: Bearer` headers to all requests and handle 401 responses by redirecting to login.
    *   **`components/`**: Reusable UI components:
        *   **`NavigationBar.tsx`**: Top navigation bar with filtering options, CSV import/export, ADD button, and a blue **Logout** button at the far right.
        *   **`Footer.tsx`**: Bottom pagination controls with page navigation and items-per-page selector.
        *   **`PaymentItemForm.tsx`**: Form for creating and editing payment items.
        *   **`ConfirmationDialog.tsx`**: Reusable confirmation dialog component.
    *   **`pages/`**: Page components:
        *   **`LoginPage.tsx`**: Dark-themed login page with username/password fields, "Stay logged in" checkbox, error display, and fade-in animation. No NavigationBar is shown on this page.
        *   **`SummaryPage.tsx`**: Main page displaying payment items with filtering and pagination.
        *   **`StatisticsPage.tsx`**: Financial charts page with balance-over-time area chart and income/expense pie charts.
        *   **`AddItemPage.tsx`** / **`AddSuccessPage.tsx`**: Create new payment items and show confirmation.
        *   **`EditItemPage.tsx`**: Edit existing payment items.
        *   **`CategoryManagerPage.tsx`**: Manage category types.
        *   **`CategoryEditPage.tsx`**: Full CRUD interface for categories including icon upload.
        *   **`NotFoundPage.tsx`**: 404 error page.
    *   **`types.ts`**: TypeScript interfaces mirroring backend models, including `UserRead` for authenticated user profiles.
    *   **`constants/textLimits.ts`**: Frontend validation constants matching backend limits.
    *   **`styles/globalStyle.ts`**: Global CSS styles and theme variables.
    *   **`assets/`**: Static assets (SVG icons for pagination arrows, sort indicators, and periodic payment indicator).
*   **`package.json`**: Project metadata, scripts, and dependencies including React 18, React Router, React Query, Styled Components, Recharts, Axios, and date-fns.
*   **`vite.config.ts`**: Vite configuration with proxy setup for API requests.
*   **`tsconfig.json`**: TypeScript compiler configuration.

### Additional Files

*   **`icons/`**: Directory for storing category icon files (auto-created).
*   **`Dockerfile`**: Docker configuration for PostgreSQL database.
*   **`run_app.sh`**: Automated setup and execution script.
*   **`requirements.txt`**: Python dependencies including FastAPI, Uvicorn, SQLModel, psycopg2-binary, python-multipart, python-jose, bcrypt, Jinja2, itsdangerous, and numpy.
*   **`admin.md`**: Comprehensive admin documentation for the multi-user authentication system (security architecture, API reference, admin panel guide, troubleshooting).

## System Requirements

Before running the application, ensure you have the following software installed:

- **Python 3.8+** with venv module
- **Node.js 18+** with npm
- **Docker** (for PostgreSQL database)
- **Git** (for cloning the repository)

## Quick Start

For a quick automated setup, use the provided execution script:

```bash
chmod +x run_app.sh
./run_app.sh
```

The script will:
1. Check for all required dependencies
2. Set up the Python virtual environment
3. Install all dependencies
4. Create necessary configuration files
5. Start the PostgreSQL database container
6. Run both backend and frontend servers
7. Open the application in your browser

## Manual Setup

If you prefer to set up the application manually, follow these detailed instructions:

### 1. Backend (FastAPI)

Navigate to the project root directory.

**Setup:**

1.  **Create and configure the .env file:**
    Create a `.env` file with the database connection string and security settings:
    ```bash
    cat > .env << 'EOF'
    DATABASE_URL=postgresql+psycopg2://yourself:secretPassword@localhost/financebook
    JWT_SECRET_KEY=your-very-long-random-secret-key-here
    ADMIN_DEFAULT_PASSWORD=MySecureAdminPassword123
    EOF
    ```
    
    | Variable | Required | Default | Description |
    |----------|----------|---------|-------------|
    | `DATABASE_URL` | No | `sqlite:///./financebook.db` | Database connection string |
    | `JWT_SECRET_KEY` | **Recommended** | Auto-generated | Secret key for signing JWT tokens. Set this in production! |
    | `ADMIN_DEFAULT_PASSWORD` | No | `admin` | Initial password for the auto-created admin account |

2.  **Create a virtual environment (recommended):**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate  # On Windows: .venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
    ```

**Create Docker image and start the PostgreSQL docker container:**
```bash
sudo docker build -t financebook-postgres .
sudo docker run -d --name financebook-db -p 5432:5432 -v postgres_data:/var/lib/postgresql/data financebook-postgres
```
The Docker container uses the credentials defined in the Dockerfile (user: `yourself`, password: `secretPassword`, database: `financebook`).

**Running the backend server:**

```bash
source .venv/bin/activate  # Ensure virtual environment is activated
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
The backend API will be available at `http://localhost:8000`. You can access the OpenAPI documentation at `http://localhost:8000/docs`.

On first startup, a default **admin** account is created automatically (username: `admin`, password: from `ADMIN_DEFAULT_PASSWORD` or `admin`). The **admin panel** is available at `http://localhost:8000/admin/login`.

### 2. Frontend (React with Vite)

Navigate to the `frontend` directory.

**Setup:**

1.  **Install dependencies:**
    ```bash
    cd frontend
    npm install
    ```

**Running the frontend development server:**

```bash
npm run dev
```
The frontend application will be available at `http://localhost:5173`. API requests from the frontend are proxied to the backend at `http://localhost:8000/api` as configured in `vite.config.ts`.

## Code Explanation & How it Works

### Backend Logic

*   **Authentication (`auth.py`)**: Implements a layered security stack:
    *   Passwords hashed with **bcrypt** (adaptive cost, automatic salting).
    *   JWT tokens issued on login via `python-jose` (HS256, 30-minute expiry).
    *   Two FastAPI dependencies: `get_current_user` (validates JWT) and `get_current_admin` (also checks `is_admin` flag).
    *   All data endpoints inject `get_current_user` for automatic authentication.
*   **Admin Panel (`admin.py`)**: Server-side rendered Jinja2 templates with signed cookie sessions (`itsdangerous`). Separate from the JWT auth flow — admin sessions use cookies with a 1-hour max age. Includes fee configuration page and API endpoints for managing per-user fee plans.
*   **Transaction Fee Engine (`fee_engine.py`)**: Computes fees using either interval-based regression curves or mathematical formulas. Formula evaluation uses Python's `ast` module for safe parsing (no `eval()`). Payment frequency is calculated as the fraction of user payments in a given amount range. Polynomial regression supports 0–5th degree with corner cases: 0 points → identity function scaled to max fee, 1 point → proportional through origin, 2 points → linear interpolation, 3+ points → least-squares polynomial fit.
*   **Data Models (`models.py`)**: SQLModel combines Pydantic (validation/serialization) and SQLAlchemy (database ORM). Relationships include:
    *   One-to-many: `User` → `PaymentItem`, `User` → `Recipient`, `User` → `Category`, `User` → `CategoryType`
    *   One-to-many: `Recipient` → `PaymentItem`, `CategoryType` → `Category`
    *   Many-to-many: `PaymentItem` ↔ `Category` via `PaymentItemCategoryLink`
    *   Self-referencing: `Category.parent_id` for hierarchical categories
*   **Multi-Tenancy**: Every data query filters by `user_id == current_user.id`. Create operations set `user_id` from the JWT token. Update/delete operations verify ownership and return `403 Forbidden` for unauthorized access.
*   **Schema Migration (`database.py`)**: On startup, automatically adds missing `user_id` columns to existing tables (idempotent). Orphaned records (from pre-multi-user era) are assigned to the admin account.
*   **API Endpoints (`main.py`)**: FastAPI automatically validates request bodies and serializes responses using the SQLModel classes. Each endpoint:
    1.  Authenticates the user via JWT (injected `get_current_user` dependency).
    2.  Receives a database `Session` via dependency injection.
    3.  Validates input data using Pydantic models.
    4.  Scopes queries to the authenticated user's data.
    5.  Commits changes and returns updated objects as JSON.
    6.  For payment item create/update/delete: computes, recomputes, or refunds transaction fees via `fee_engine.py`.
*   **Validation & Normalization**: Names are normalized (whitespace collapsed), uniqueness is enforced (per user), and field lengths are validated against constants.
*   **File Management**: Uploaded files (icons and invoices) are stored in dedicated directories with unique filenames. Files are automatically deleted when associated records are removed. Invoice uploads/downloads enforce ownership checks.
*   **Category Filtering**: When filtering by categories, the backend automatically expands the selection to include all descendant categories, making parent category selection intuitive.

### Frontend Logic

*   **State Management (React Query)**: TanStack React Query manages server state with automatic caching, background refetching, and optimistic updates. Custom hooks in `api/hooks.ts` provide a clean API abstraction.
*   **Routing (React Router)**: Client-side routing with `react-router-dom`. Routes defined in `App.tsx` map URLs to page components. `useNavigate` for programmatic navigation, `useParams` for URL parameters, `useSearchParams` for query strings.
*   **Component Architecture**:
    *   **Pages**: Top-level components that fetch data and manage page-specific state.
    *   **Components**: Reusable UI elements with props-based configuration.
    *   **Context**: `PaginationContext` in `SummaryPage.tsx` provides pagination state to the `Footer` component.
*   **Styling (Styled Components)**: CSS-in-JS with component-scoped styles and dynamic styling based on props. Global styles and theme variables in `styles/globalStyle.ts`.
*   **Type Safety (TypeScript)**: Full TypeScript coverage with interfaces in `types.ts` matching backend models, ensuring type safety across the application.
*   **Build Process (Vite)**: Fast development server with Hot Module Replacement (HMR) and optimized production builds. Proxy configuration forwards `/api` requests to the backend.

## Key Features Explained

### Authentication & Security
- **bcrypt** password hashing with adaptive cost factor and automatic salting
- **JWT** access tokens (HS256, 30-minute expiry) for API authentication
- OAuth2-compatible Bearer token flow with Swagger UI integration
- Configurable `JWT_SECRET_KEY` (auto-generated if not set, but should be fixed in production)
- Deactivated accounts are immediately locked out; active tokens become invalid
- Minimum password length: 6 characters (enforced on registration, update, and admin reset)

### Admin Panel
- Dark-themed, responsive server-side rendered web UI at `/admin`
- Session-based authentication with signed cookies (separate from JWT)
- Dashboard with real-time statistics across all users
- User management: search, edit profiles, reset passwords, activate/deactivate
- Transaction fee configuration with interactive chart editor (see **Transaction Fees** below)
- Safety guard: admins cannot deactivate their own account
- For full documentation, see [`admin.md`](admin.md)

### Invoice Management
- Upload invoices (PDF, images, documents) up to 25MB per payment item
- Automatic file cleanup when payment items are deleted
- Download invoices via dedicated endpoint
- Delete invoices independently of payment items
- All invoice operations enforce ownership checks (user can only access their own invoices)

### Statistics & Charts
- **Balance Over Time**: Running cumulative balance plotted as an area chart with gradient fill
- **Income Pie Chart**: Donut chart showing income distribution by category (green palette)
- **Expense Pie Chart**: Donut chart showing expense distribution by category (red palette)
- Category names resolved via `standard_category_id` lookup against the full category tree
- Y-axis uses full number notation with German-style dot separators (e.g., "3.300 €")
- Custom tooltips showing exact amounts in euros
- Responsive layout: pie charts stack vertically on narrow screens

### Category System
- Hierarchical categories with unlimited nesting depth
- Multiple category types (e.g., "standard", custom types)
- One category per type per payment item (enforced)
- Icon support for visual identification
- Automatic descendant expansion in filters
- Categories are scoped per user (each user has their own category tree)

### Periodic Payment Indicator
- Payment items marked as periodic display a blue circular-arrow icon next to their date
- Provides quick visual identification of recurring payments in the summary list

### Pagination
- Single-row bar anchored to the bottom of the viewport
- Custom blue arrow icons for Previous/Next navigation
- Customizable items per page and "Show All" functionality
- Real-time page count updates
- Persistent across filter changes

### Data Import/Export
- CSV import with automatic entity creation (assigned to the authenticated user)
- CSV export to download all payment data
- Validation of data types and field lengths
- Deduplication of recipients and categories (scoped per user)
- Batch processing with transaction safety

### Transaction Fees
- **Per-user fee plans** configured via the admin panel at `/admin/fees`
- Two fee plan modes:
  - **Amount Table** (default): define payment amount intervals (e.g., `[0, 100, 500, 1000]`) with per-interval fee curves set by clicking points on an interactive chart canvas and running regression
  - **Formula**: a mathematical expression `f(x, y)` where `x` = absolute payment amount and `y` = payment frequency (evaluated safely via AST parsing, no `eval()`)
- **Interactive chart**: canvas-based editor with axes for payment frequency (0–1) and relative transaction fee (0–maxFee), click-to-set data points, and polynomial regression
- **Regression corner cases**: 0 points → identity function `f(x) = maxFee * x`; 1 point → proportional slope; 2 points → linear interpolation; 3+ → polynomial fit (up to degree 5)
- **Fee application rules**:
  - Income (positive): fee subtracted from stored amount
  - Expense (negative): fee subtracted, increasing the absolute value
  - Fee capped at 100% of the payment amount
  - Fees below 0.01€ (after rounding to 2 decimal places) are not applied
- **Lifecycle integration**: fees auto-applied on payment create, recomputed on amount update, refunded on delete
- **Non-retroactive**: changing a fee plan does not affect existing payment items
- **Database models**: `TransactionFeePlan` (one per user) and `TransactionFeeRecord` (one per payment item with fee)
