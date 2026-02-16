"""
Domain entities for FinanceBook.

The **heart** of the application is the `PaymentItem` – an atomic cash-flow event.
Everything else (recipients, tags / categories, attachments) hangs off that
object, allowing powerful filtering, aggregation and visualisation.

Modelling goals
---------------
1. *Extensibility* – users can create their own category dimensions (types) and
   extend taxonomy trees arbitrarily deep.
2. *Simplicity* – while SQLModel can handle complex relations, keep the schema
   intuitive for analysts exploring the database directly.
3. *Performance* – avoid unnecessary join tables unless the relationship is
   logically many-to-many (e.g. items ↔ categories).
4. *Multi-tenancy* – every data entity belongs to a specific user via `user_id`.

All tables inherit from `SQLModel` so they work seamlessly with FastAPI's
response models and carry proper type hints for IDE autocompletion.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import List, Optional

from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy.orm import Mapped

from .constants import (
    MAX_CATEGORY_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_RECIPIENT_ADDRESS_LENGTH,
    MAX_RECIPIENT_NAME_LENGTH,
    MAX_USERNAME_LENGTH,
    MAX_USER_NAME_LENGTH,
    MAX_USER_PHONE_LENGTH,
    MAX_USER_ROAD_LENGTH,
    MAX_USER_HOUSE_NUMBER_LENGTH,
    MAX_USER_REGION_LENGTH,
    MAX_USER_POSTAL_LENGTH,
    MAX_USER_CITY_LENGTH,
    MAX_USER_STATE_LENGTH,
)


# ─── User Management ────────────────────────────────────────────────

class User(SQLModel, table=True):
    """
    Application user with personal details and structured address.

    Passwords are stored as bcrypt hashes via passlib – **never** in plaintext.
    The `is_admin` flag grants access to the admin management website.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(max_length=MAX_USERNAME_LENGTH, sa_column_kwargs={"unique": True})
    hashed_password: str  # bcrypt hash produced by passlib

    # Personal details
    surname: str = Field(max_length=MAX_USER_NAME_LENGTH)
    prename: str = Field(max_length=MAX_USER_NAME_LENGTH)
    birth_date: Optional[date] = None
    phone: Optional[str] = Field(default=None, max_length=MAX_USER_PHONE_LENGTH)

    # Structured address
    road: Optional[str] = Field(default=None, max_length=MAX_USER_ROAD_LENGTH)
    house_number: Optional[str] = Field(default=None, max_length=MAX_USER_HOUSE_NUMBER_LENGTH)
    region: Optional[str] = Field(default=None, max_length=MAX_USER_REGION_LENGTH)
    postal: Optional[str] = Field(default=None, max_length=MAX_USER_POSTAL_LENGTH)
    city: Optional[str] = Field(default=None, max_length=MAX_USER_CITY_LENGTH)
    state: Optional[str] = Field(default=None, max_length=MAX_USER_STATE_LENGTH)

    # Role & status
    is_admin: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserCreate(SQLModel):
    """Schema for creating a new user via the API."""
    username: str = Field(max_length=MAX_USERNAME_LENGTH)
    password: str  # plaintext – will be hashed before storage
    surname: str = Field(max_length=MAX_USER_NAME_LENGTH)
    prename: str = Field(max_length=MAX_USER_NAME_LENGTH)
    birth_date: Optional[date] = None
    phone: Optional[str] = Field(default=None, max_length=MAX_USER_PHONE_LENGTH)
    road: Optional[str] = Field(default=None, max_length=MAX_USER_ROAD_LENGTH)
    house_number: Optional[str] = Field(default=None, max_length=MAX_USER_HOUSE_NUMBER_LENGTH)
    region: Optional[str] = Field(default=None, max_length=MAX_USER_REGION_LENGTH)
    postal: Optional[str] = Field(default=None, max_length=MAX_USER_POSTAL_LENGTH)
    city: Optional[str] = Field(default=None, max_length=MAX_USER_CITY_LENGTH)
    state: Optional[str] = Field(default=None, max_length=MAX_USER_STATE_LENGTH)


class UserRead(SQLModel):
    """Schema for returning user data (never exposes password hash)."""
    id: int
    username: str
    surname: str
    prename: str
    birth_date: Optional[date] = None
    phone: Optional[str] = None
    road: Optional[str] = None
    house_number: Optional[str] = None
    region: Optional[str] = None
    postal: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_admin: bool
    is_active: bool
    created_at: datetime


class UserUpdate(SQLModel):
    """Schema for updating user profile. All fields optional for partial updates."""
    surname: Optional[str] = Field(default=None, max_length=MAX_USER_NAME_LENGTH)
    prename: Optional[str] = Field(default=None, max_length=MAX_USER_NAME_LENGTH)
    birth_date: Optional[date] = None
    phone: Optional[str] = Field(default=None, max_length=MAX_USER_PHONE_LENGTH)
    road: Optional[str] = Field(default=None, max_length=MAX_USER_ROAD_LENGTH)
    house_number: Optional[str] = Field(default=None, max_length=MAX_USER_HOUSE_NUMBER_LENGTH)
    region: Optional[str] = Field(default=None, max_length=MAX_USER_REGION_LENGTH)
    postal: Optional[str] = Field(default=None, max_length=MAX_USER_POSTAL_LENGTH)
    city: Optional[str] = Field(default=None, max_length=MAX_USER_CITY_LENGTH)
    state: Optional[str] = Field(default=None, max_length=MAX_USER_STATE_LENGTH)
    password: Optional[str] = None  # new password, will be re-hashed


# Association table (many-to-many) between PaymentItem and Category
class PaymentItemCategoryLink(SQLModel, table=True):
    """
    Pure link table.

    We *could* store extra metadata here (e.g. confidence score if tags were
    auto-inferred by an ML model), but for now the composite primary key is
    sufficient.
    """
    payment_item_id: Optional[int] = Field(
        default=None, foreign_key="paymentitem.id", primary_key=True
    )
    category_id: Optional[int] = Field(
        default=None, foreign_key="category.id", primary_key=True
    )



# Taxonomy
class CategoryType(SQLModel, table=True):
    """
    A user-defined classification dimension.

    Examples of types:
        • *Spending Area*   (Food, Rent, …)
        • *Payment Method*  (Cash, Credit Card, …)
        • *VAT Rate*        (19%, 7%, 0%)
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=MAX_CATEGORY_NAME_LENGTH)
    description: Optional[str] = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")


class Category(SQLModel, table=True):
    """
    A single tag within a 'CategoryType' taxonomy tree.

    The self-referencing 'parent_id' allows arbitrary depth without cycles
    (SQLModel enforces this by pointing 'sa_relationship_kwargs["remote_side"]'
    back to the same column).
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=MAX_CATEGORY_NAME_LENGTH)

    # Which type does this tag belong to?
    type_id: int = Field(foreign_key="categorytype.id")

    # recursive parent pointer (nullable for root nodes)
    parent_id: Optional[int] = Field(default=None, foreign_key="category.id")

    # optional filename of an icon associated with this category
    icon_file: Optional[str] = None

    # owner
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    


class CategoryUpdate(SQLModel):
    """Schema for updating an existing category."""
    name: Optional[str] = None
    type_id: Optional[int] = None
    parent_id: Optional[int] = None
    icon_file: Optional[str] = None



# Core business entities

class Recipient(SQLModel, table=True):
    """
    Person or organisation involved in a transaction.

    Keeping this in a separate table lets us:
    • De-duplicate recipient data across many payment items
    • Attach future metadata (e.g. contact info, logo, IBAN)
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=MAX_RECIPIENT_NAME_LENGTH)
    address: Optional[str] = Field(default=None, max_length=MAX_RECIPIENT_ADDRESS_LENGTH)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")


class RecipientUpdate(SQLModel):
    """Schema for updating an existing recipient."""

    name: Optional[str] = Field(default=None, max_length=MAX_RECIPIENT_NAME_LENGTH)
    address: Optional[str] = Field(default=None, max_length=MAX_RECIPIENT_ADDRESS_LENGTH)
    


class PaymentItemBase(SQLModel):
    """
    Base model for a payment item, containing all common fields.

    Conventions
    -----------
    • Negative `amount`  → Expense  (money out)
    • Positive `amount`  → Income   (money in)
    • `date` uses ISO format for API consistency with frontend
    • `periodic=True` marks template items that spawn future instances via
      scheduled jobs (not yet implemented).
    """
    amount: float  # use DECIMAL in production to avoid rounding errors
    date: datetime  # changed from timestamp to date for frontend compatibility
    periodic: bool = False
    description: Optional[str] = Field(
        default=None, max_length=MAX_DESCRIPTION_LENGTH
    )  # description of what this payment is for

    # optional attachments (local path or S3 URL – persisted by upload endpoints)
    invoice_path: Optional[str] = None
    product_image_path: Optional[str] = None
    recipient_id: Optional[int] = Field(default=None, foreign_key="recipient.id")
    
    # direct reference to the standard category for efficient icon retrieval
    standard_category_id: Optional[int] = Field(default=None, foreign_key="category.id")

    # owner
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")

class PaymentItem(PaymentItemBase, table=True):
    """
    Database model for a payment item. Inherits from Base and adds DB-specific fields.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    


# API Models (Pydantic Schemas) for PaymentItem

class PaymentItemCreate(PaymentItemBase):
    """
    Schema for creating a new payment item via the API.
    Accepts a list of category IDs instead of full Category objects.
    """
    category_ids: Optional[List[int]] = []
    user_id: Optional[int] = None  # will be set from JWT

class PaymentItemUpdate(PaymentItemBase):
    """
    Schema for updating an existing payment item via the API.
    All fields are optional for partial updates.
    """
    amount: Optional[float] = None
    date: Optional[datetime] = None
    periodic: Optional[bool] = None
    description: Optional[str] = None
    invoice_path: Optional[str] = None
    product_image_path: Optional[str] = None
    recipient_id: Optional[int] = None
    standard_category_id: Optional[int] = None
    category_ids: Optional[List[int]] = None
    user_id: Optional[int] = None  # should not be updatable by user

class PaymentItemRead(PaymentItemBase):
    """
    Schema for reading/returning a payment item from the API.
    Includes the full Recipient and Category objects for detailed views.
    """
    id: int
    recipient: Optional[Recipient] = None
    categories: List[Category] = []
    standard_category: Optional[Category] = None
    transaction_fee: Optional[float] = None


# ─── Transaction Fee Models ──────────────────────────────────────────

class TransactionFeePlan(SQLModel, table=True):
    """
    Fee configuration for a user.

    Each user has at most one active fee plan.  The plan can be defined
    in two modes:
      • **table** – an amount table with per-interval chart-based fees
      • **formula** – a single mathematical expression f(x, y)

    When the mode is "table", `amount_table_json` holds the sorted list
    of lower-limit amounts (e.g. ``[0, 100, 500]``), and
    `interval_data_json` holds a dict keyed by interval start value
    containing max_fee, clicked points, and regression coefficients.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", sa_column_kwargs={"unique": True})

    mode: str = Field(default="table")           # "table" | "formula"
    formula_text: Optional[str] = None            # e.g. "x*y+0.05"
    amount_table_json: str = Field(default="[0]") # JSON array
    interval_data_json: str = Field(default="{}")  # JSON dict

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TransactionFeeRecord(SQLModel, table=True):
    """
    Record of a fee applied to a specific payment item.

    Stored so that fee refunds (on delete) and adjustments (on update)
    can be processed accurately, independent of any later changes to
    the user's fee plan.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    payment_item_id: int = Field(foreign_key="paymentitem.id")
    user_id: int = Field(foreign_key="user.id")

    fee_amount: float          # always positive – the actual fee charged
    original_amount: float     # payment amount before fee deduction

    created_at: datetime = Field(default_factory=datetime.utcnow)
