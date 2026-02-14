# FinanceBook - Private Finance Management Application

FinanceBook is a web application designed for managing private finances and cash flows. It features a modern React frontend with a FastAPI backend, utilizing state-of-the-art technologies and a clean, professional design.

## Core Features (Current Implementation)

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
    *   A default `UNCLASSIFIED` category under the "standard" type is created on first run.
    *   Support for one category per type per payment item (enforced validation).
    *   Hierarchical category filtering with automatic descendant expansion.
*   **Recipient Management**:
    *   Create, read, update recipients (persons or organizations).
    *   Each recipient has a name and optional address field.
    *   Name normalization and uniqueness validation.
*   **Filtering & Pagination**:
    *   Filter payment items by "All", "Incomes", or "Expenses".
    *   Filter by one or more categories with OR logic (items matching ANY selected category).
    *   The backend automatically expands selected categories to include all descendants.
    *   Single-row pagination bar anchored to the bottom of the viewport with custom blue arrow icons for Previous/Next navigation.
    *   Customizable items per page and "Show All" functionality.
*   **Data Import/Export**:
    *   CSV import functionality for bulk data import.
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
    *   **Payment Items**: `POST /payment-items`, `GET /payment-items`, `GET /payment-items/{item_id}`, `PUT /payment-items/{item_id}`, `DELETE /payment-items/{item_id}`
    *   **Categories**: `POST /categories`, `GET /categories`, `GET /categories/{category_id}`, `PUT /categories/{category_id}`, `GET /categories/{category_id}/tree`, `GET /categories/{category_id}/descendants`, `GET /categories/by-type/{type_id}`
    *   **Category Types**: `POST /category-types`, `GET /category-types`
    *   **Recipients**: `POST /recipients`, `GET /recipients`, `GET /recipients/{recipient_id}`, `PUT /recipients/{recipient_id}`
    *   **File Uploads**: `POST /uploadicon/`, `GET /download_static/{filename}`, `POST /upload-invoice/{payment_item_id}`, `GET /download-invoice/{payment_item_id}`, `DELETE /invoice/{payment_item_id}`
    *   **Data Import**: `POST /import-csv`
    *   Includes comprehensive logging, validation, and error handling.
    *   Automatic initialization of default data (standard category type and UNCLASSIFIED category).
*   **`models.py`**: Defines SQLModel classes for database tables and API schemas:
    *   `PaymentItem`, `PaymentItemCreate`, `PaymentItemRead`, `PaymentItemUpdate`
    *   `Category`, `CategoryUpdate`, `CategoryType`
    *   `Recipient`, `RecipientUpdate`
    *   `PaymentItemCategoryLink` (many-to-many association table)
    *   Includes comprehensive documentation and type hints.
*   **`database.py`**: Manages PostgreSQL database connection and table creation using SQLModel.
*   **`constants.py`**: Application-wide constants for validation (max lengths for text fields).
*   **`.env`**: Environment configuration file containing the DATABASE_URL for PostgreSQL connection.
*   **`/invoices`**: Directory for storing uploaded invoice files (auto-created).

### Frontend (`/frontend` directory)

*   **`src/`**: Contains all React application source code.
    *   **`main.tsx`**: Entry point setting up React Query and React Router.
    *   **`App.tsx`**: Root component defining global layout, routes, and navigation.
    *   **`api/hooks.ts`**: Custom React Query hooks for API interactions with automatic caching and refetching.
    *   **`components/`**: Reusable UI components:
        *   **`NavigationBar.tsx`**: Top navigation bar with filtering options and menu trigger.
        *   **`Footer.tsx`**: Bottom pagination controls with page navigation and items-per-page selector.
        *   **`PaymentItemForm.tsx`**: Form for creating and editing payment items.
        *   **`ConfirmationDialog.tsx`**: Reusable confirmation dialog component.
    *   **`pages/`**: Page components:
        *   **`SummaryPage.tsx`**: Main page displaying payment items with filtering and pagination.
        *   **`StatisticsPage.tsx`**: Financial charts page with balance-over-time area chart and income/expense pie charts.
        *   **`AddItemPage.tsx`** / **`AddSuccessPage.tsx`**: Create new payment items and show confirmation.
        *   **`EditItemPage.tsx`**: Edit existing payment items.
        *   **`CategoryManagerPage.tsx`**: Manage category types.
        *   **`CategoryEditPage.tsx`**: Full CRUD interface for categories including icon upload.
        *   **`NotFoundPage.tsx`**: 404 error page.
    *   **`types.ts`**: TypeScript interfaces mirroring backend models.
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
*   **`requirements.txt`**: Python dependencies including FastAPI, Uvicorn, SQLModel, psycopg2-binary, and python-multipart.

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
    Create a `.env` file with the database connection string:
    ```bash
    echo "DATABASE_URL=postgresql+psycopg2://yourself:secretPassword@localhost/financebook" > .env
    ```

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

*   **Data Models (`models.py`)**: SQLModel combines Pydantic (validation/serialization) and SQLAlchemy (database ORM). Relationships include:
    *   One-to-many: `Recipient` → `PaymentItem`, `CategoryType` → `Category`
    *   Many-to-many: `PaymentItem` ↔ `Category` via `PaymentItemCategoryLink`
    *   Self-referencing: `Category.parent_id` for hierarchical categories
*   **API Endpoints (`main.py`)**: FastAPI automatically validates request bodies and serializes responses using the SQLModel classes. Each endpoint:
    1.  Receives a database `Session` via dependency injection.
    2.  Validates input data using Pydantic models.
    3.  Uses SQLModel's query interface for database operations.
    4.  Commits changes and returns updated objects as JSON.
*   **Validation & Normalization**: Names are normalized (whitespace collapsed), uniqueness is enforced, and field lengths are validated against constants.
*   **File Management**: Uploaded files (icons and invoices) are stored in dedicated directories with unique filenames. Files are automatically deleted when associated records are removed.
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

### Invoice Management
- Upload invoices (PDF, images, documents) up to 25MB per payment item
- Automatic file cleanup when payment items are deleted
- Download invoices via dedicated endpoint
- Delete invoices independently of payment items

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
- CSV import with automatic entity creation
- CSV export to download all payment data
- Validation of data types and field lengths
- Deduplication of recipients and categories
- Batch processing with transaction safety
