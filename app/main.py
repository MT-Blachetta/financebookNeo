from typing import List, Optional
from datetime import datetime

import csv
import io
import re
import shutil
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.database import create_db_and_tables, get_session
from app.constants import (
    MAX_CATEGORY_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_RECIPIENT_ADDRESS_LENGTH,
    MAX_RECIPIENT_NAME_LENGTH,
    MAX_USERNAME_LENGTH,
)
from app.models import (
    PaymentItem,
    PaymentItemCreate,
    PaymentItemRead,
    PaymentItemUpdate,
    CategoryType,
    Category,
    CategoryUpdate,
    Recipient,
    RecipientUpdate,
    PaymentItemCategoryLink,
    User,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_admin,
)


CSV_HEADER_FIELDS = [
    "amount",
    "date",
    "description",
    "Recipient name",
    "Recipient address",
    "standard_category name",
    "periodic",
]
CSV_HEADER = ";".join(CSV_HEADER_FIELDS)
AMOUNT_PATTERN = re.compile(r"^-?\d+(?:\.\d+)?$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BOOLEAN_PATTERN = re.compile(r"^(true|false)$", re.IGNORECASE)

app = FastAPI(title="FinanceBook API", version="0.2.0")

# directory where uploaded category icon files are stored
ICON_DIR = Path("icons")
ICON_DIR.mkdir(exist_ok=True)

# directory where uploaded invoice files are stored
INVOICE_DIR = Path("app/invoices")
INVOICE_DIR.mkdir(exist_ok=True)

# directory for static admin assets
STATIC_DIR = Path("app/static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _normalize_name(raw_name: str) -> str:
    """Normalize user provided names by collapsing whitespace."""

    # First strip leading/trailing whitespace, then collapse internal runs
    # of whitespace characters (spaces, tabs, newlines) into single spaces.
    return re.sub(r"\s+", " ", raw_name.strip())


@app.on_event("startup")
def on_startup() -> None:
    """Create tables on first run and initialize default data."""
    create_db_and_tables()
    initialize_default_data()


def initialize_default_data() -> None:
    """Initialize default data: admin user, standard category type, UNCLASSIFIED."""
    from app.database import engine
    with Session(engine) as session:
        # ── Seed default admin account ──────────────────────────────
        admin_user = session.exec(
            select(User).where(User.username == "admin")
        ).first()

        if not admin_user:
            import os
            from dotenv import load_dotenv
            load_dotenv()
            default_pw = os.getenv("ADMIN_DEFAULT_PASSWORD", "admin")
            admin_user = User(
                username="admin",
                hashed_password=hash_password(default_pw),
                surname="Administrator",
                prename="System",
                is_admin=True,
                is_active=True,
            )
            session.add(admin_user)
            session.commit()
            session.refresh(admin_user)

        # ── Standard category type ─────────────────────────────────
        standard_type = session.exec(
            select(CategoryType).where(CategoryType.name == "standard")
        ).first()

        if not standard_type:
            standard_type = CategoryType(
                name="standard",
                description="Default category type for basic expense/income classification",
                user_id=admin_user.id,
            )
            session.add(standard_type)
            session.commit()
            session.refresh(standard_type)

        # ── Default UNCLASSIFIED category ──────────────────────────
        unclassified = session.exec(
            select(Category).where(Category.name == "UNCLASSIFIED")
        ).first()
        if not unclassified:
            unclassified = Category(
                name="UNCLASSIFIED",
                type_id=standard_type.id,
                parent_id=None,
                user_id=admin_user.id,
            )
            session.add(unclassified)
            session.commit()

        # ── Assign orphaned records to admin (migration) ───────────
        _assign_orphaned_records(session, admin_user.id)


def _assign_orphaned_records(session: Session, admin_id: int) -> None:
    """Assign any records without a user_id to the admin user (one-time migration)."""
    for model in (PaymentItem, Recipient, CategoryType, Category):
        orphans = session.exec(
            select(model).where(model.user_id == None)  # noqa: E711
        ).all()
        for record in orphans:
            record.user_id = admin_id
            session.add(record)
    session.commit()


# ═══════════════════════════════════════════════════════════════════
#  AUTHENTICATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@app.post("/auth/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> dict:
    """Authenticate with username/password and receive a JWT access token."""
    user = session.exec(
        select(User).where(User.username == form_data.username)
    ).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    token = create_access_token(data={"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/auth/register", response_model=UserRead)
def register(
    user_data: UserCreate,
    session: Session = Depends(get_session),
) -> User:
    """Register a new user account."""
    normalized_username = _normalize_name(user_data.username)
    if not normalized_username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    if len(normalized_username) > MAX_USERNAME_LENGTH:
        raise HTTPException(status_code=400, detail=f"Username exceeds {MAX_USERNAME_LENGTH} characters")

    existing = session.exec(
        select(User).where(User.username == normalized_username)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")

    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    new_user = User(
        username=normalized_username,
        hashed_password=hash_password(user_data.password),
        surname=_normalize_name(user_data.surname),
        prename=_normalize_name(user_data.prename),
        birth_date=user_data.birth_date,
        phone=user_data.phone,
        road=user_data.road,
        house_number=user_data.house_number,
        region=user_data.region,
        postal=user_data.postal,
        city=user_data.city,
        state=user_data.state,
        is_admin=False,
        is_active=True,
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    # Create default category type and UNCLASSIFIED category for the new user
    standard_type = CategoryType(
        name="standard",
        description="Default category type for basic expense/income classification",
        user_id=new_user.id,
    )
    session.add(standard_type)
    session.commit()
    session.refresh(standard_type)

    unclassified = Category(
        name="UNCLASSIFIED",
        type_id=standard_type.id,
        parent_id=None,
        user_id=new_user.id,
    )
    session.add(unclassified)
    session.commit()

    return new_user


@app.get("/auth/me", response_model=UserRead)
def get_profile(
    current_user: User = Depends(get_current_user),
) -> User:
    """Return the profile of the currently authenticated user."""
    return current_user


@app.put("/auth/me", response_model=UserRead)
def update_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    """Update the profile of the currently authenticated user."""
    update_data = user_update.dict(exclude_unset=True)

    if "password" in update_data and update_data["password"]:
        if len(update_data["password"]) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        current_user.hashed_password = hash_password(update_data["password"])
        del update_data["password"]

    for key, value in update_data.items():
        if key == "surname" or key == "prename":
            value = _normalize_name(value) if value else value
        setattr(current_user, key, value)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


# ═══════════════════════════════════════════════════════════════════
#  ADMIN API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@app.get("/admin/api/users", response_model=List[UserRead])
def admin_list_users(
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> List[User]:
    """List all users (admin only)."""
    return session.exec(select(User)).all()


@app.get("/admin/api/users/{user_id}", response_model=UserRead)
def admin_get_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> User:
    """Get a user by ID (admin only)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.put("/admin/api/users/{user_id}", response_model=UserRead)
def admin_update_user(
    user_id: int,
    user_update: UserUpdate,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> User:
    """Update a user (admin only)."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.dict(exclude_unset=True)

    if "password" in update_data and update_data["password"]:
        if len(update_data["password"]) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user.hashed_password = hash_password(update_data["password"])
        del update_data["password"]

    for key, value in update_data.items():
        if key in ("surname", "prename"):
            value = _normalize_name(value) if value else value
        setattr(user, key, value)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@app.delete("/admin/api/users/{user_id}")
def admin_deactivate_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    session: Session = Depends(get_session),
) -> dict:
    """Deactivate a user account (admin only). Does not delete data."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own admin account")
    user.is_active = False
    session.add(user)
    session.commit()
    return {"message": f"User '{user.username}' has been deactivated"}


# ═══════════════════════════════════════════════════════════════════
#  PAYMENT ITEM ENDPOINTS  (scoped to authenticated user)
# ═══════════════════════════════════════════════════════════════════

@app.post("/payment-items", response_model=PaymentItemRead)
def create_payment_item(
    item_create: PaymentItemCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PaymentItem:
    # 1. Validate recipient if provided
    if item_create.recipient_id:
        recipient = session.get(Recipient, item_create.recipient_id)
        if not recipient:
            raise HTTPException(status_code=404, detail=f"Recipient with id {item_create.recipient_id} not found")
        if recipient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Recipient does not belong to you")

    # 2. Get standard type ID for later use
    standard_type = session.exec(
        select(CategoryType).where(CategoryType.name == "standard", CategoryType.user_id == current_user.id)
    ).first()
    standard_type_id = standard_type.id if standard_type else None

    # 3. Validate categories if provided
    category_ids = []
    standard_category_id = None
    if item_create.category_ids:
        seen_types = set()
        for cat_id in item_create.category_ids:
            category = session.get(Category, cat_id)
            if not category:
                raise HTTPException(status_code=404, detail=f"Category with id {cat_id} not found")
            if category.user_id != current_user.id:
                raise HTTPException(status_code=403, detail=f"Category {cat_id} does not belong to you")
            if category.type_id in seen_types:
                raise HTTPException(status_code=400, detail="Only one category per type is allowed")
            seen_types.add(category.type_id)
            category_ids.append(cat_id)
            
            # Set standard_category_id if this is a standard type category
            if standard_type_id and category.type_id == standard_type_id:
                standard_category_id = cat_id
    else:
        # Assign the default UNCLASSIFIED category
        default_cat = session.exec(
            select(Category).where(Category.name == "UNCLASSIFIED", Category.user_id == current_user.id)
        ).first()
        if default_cat:
            category_ids.append(default_cat.id)
            if standard_type_id and default_cat.type_id == standard_type_id:
                standard_category_id = default_cat.id

    # 4. Create PaymentItem instance from the payload
    item_data = item_create.dict(exclude={"category_ids", "user_id"})
    item_data["standard_category_id"] = standard_category_id
    item_data["user_id"] = current_user.id
    db_item = PaymentItem(**item_data)

    # 5. Add to session and commit
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    
    # 6. Add category links if provided
    if category_ids:
        for cat_id in category_ids:
            link = PaymentItemCategoryLink(payment_item_id=db_item.id, category_id=cat_id)
            session.add(link)
        session.commit()

    return db_item


@app.get("/payment-items", response_model=List[PaymentItemRead])
def list_payment_items(
    expense_only: bool = False,
    income_only: bool = False,
    category_ids: Optional[List[int]] = Query(None, description="List of category IDs to filter by"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[PaymentItem]:
    import logging
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    if expense_only and income_only:
        raise HTTPException(status_code=400, detail="Choose only one filter: expense_only or income_only")

    query = select(PaymentItem).where(PaymentItem.user_id == current_user.id)
    if expense_only:
        query = query.where(PaymentItem.amount < 0)
    if income_only:
        query = query.where(PaymentItem.amount > 0)

    if category_ids:
        logger.info(f"Filtering with category IDs: {category_ids}")
        
        # Expand the category list with all descendants so filtering a parent
        # category also returns items tagged with any of its children.
        expanded_ids: set[int] = set(category_ids)

        def gather_descendants(root_id: int) -> None:
            queue = [root_id]
            while queue:
                current = queue.pop(0)
                children = session.exec(select(Category.id).where(Category.parent_id == current)).all()
                for child_id in children:
                    if child_id not in expanded_ids:
                        expanded_ids.add(child_id)
                        queue.append(child_id)

        for cat_id in list(category_ids):
            gather_descendants(cat_id)

        logger.info(f"Expanded category IDs (including descendants): {expanded_ids}")

        # Use explicit OR logic: return payment items that have ANY of the selected categories
        subquery = (
            select(PaymentItemCategoryLink.payment_item_id)
            .where(PaymentItemCategoryLink.category_id.in_(expanded_ids))
            .distinct()
        )
        
        query = query.where(PaymentItem.id.in_(subquery))
        
        logger.info(f"Generated explicit OR logic query for category filtering")

    results = session.exec(query).all()
    logger.info(f"Found {len(results)} payment items matching the filters")
    
    return results


@app.get("/payment-items/{item_id}", response_model=PaymentItemRead)
def get_payment_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PaymentItem:
    item = session.get(PaymentItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this item")
    return item


@app.put("/payment-items/{item_id}", response_model=PaymentItemRead)
def update_payment_item(
    item_id: int,
    item_update: PaymentItemUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PaymentItem:
    import logging
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"Starting update for payment item {item_id}")
        logger.info(f"Update data received: {item_update.dict(exclude_unset=True)}")
        
        db_item = session.get(PaymentItem, item_id)
        if not db_item:
            logger.error(f"Payment item {item_id} not found")
            raise HTTPException(status_code=404, detail="Item not found")
        if db_item.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this item")

        logger.info(f"Found existing item: {db_item}")

        # 1. Update standard fields
        update_data = item_update.dict(exclude_unset=True)
        logger.info(f"Processing standard fields: {[k for k in update_data.keys() if k not in ('category_ids', 'user_id')]}")
        
        for key, value in update_data.items():
            if key not in ("category_ids", "user_id"):  # defer category update, protect user_id
                logger.debug(f"Setting {key} = {value}")
                setattr(db_item, key, value)

        # 2. Validate and update recipient if provided
        if item_update.recipient_id:
            logger.info(f"Validating recipient {item_update.recipient_id}")
            recipient = session.get(Recipient, item_update.recipient_id)
            if not recipient:
                logger.error(f"Recipient {item_update.recipient_id} not found")
                raise HTTPException(status_code=404, detail=f"Recipient with id {item_update.recipient_id} not found")
            if recipient.user_id != current_user.id:
                raise HTTPException(status_code=403, detail="Recipient does not belong to you")
            db_item.recipient_id = item_update.recipient_id
            logger.info(f"Recipient updated successfully")

        # 3. Validate and update categories if provided
        if item_update.category_ids is not None:
            logger.info(f"Processing categories: {item_update.category_ids}")
            
            # get standard type ID for later use
            standard_type = session.exec(
                select(CategoryType).where(CategoryType.name == "standard", CategoryType.user_id == current_user.id)
            ).first()
            standard_type_id = standard_type.id if standard_type else None
            
            # first, remove existing category links
            logger.info("Removing existing category links")
            existing_links = session.exec(
                select(PaymentItemCategoryLink).where(PaymentItemCategoryLink.payment_item_id == item_id)
            ).all()
            for link in existing_links:
                session.delete(link)
            logger.info(f"Removed {len(existing_links)} existing category links")
            
            # then add new category links and determine standard category
            categories = []
            seen_types = set()
            standard_category_id = None
            if item_update.category_ids:  # If list is not empty
                for cat_id in item_update.category_ids:
                    logger.debug(f"Validating category {cat_id}")
                    category = session.get(Category, cat_id)
                    if not category:
                        logger.error(f"Category {cat_id} not found")
                        raise HTTPException(status_code=404, detail=f"Category with id {cat_id} not found")
                    if category.user_id != current_user.id:
                        raise HTTPException(status_code=403, detail=f"Category {cat_id} does not belong to you")
                    if category.type_id in seen_types:
                        logger.error(f"Duplicate category type {category.type_id}")
                        raise HTTPException(status_code=400, detail="Only one category per type is allowed")
                    seen_types.add(category.type_id)
                    categories.append(category)
                    
                    # set standard_category_id if this is a standard type category
                    if standard_type_id and category.type_id == standard_type_id:
                        standard_category_id = cat_id
                    
                    # create new link
                    link = PaymentItemCategoryLink(payment_item_id=item_id, category_id=cat_id)
                    session.add(link)
                    logger.debug(f"Added category link for category {cat_id}")
            else:
                # assign default UNCLASSIFIED category
                logger.info("No categories provided, assigning UNCLASSIFIED")
                default_cat = session.exec(
                    select(Category).where(Category.name == "UNCLASSIFIED", Category.user_id == current_user.id)
                ).first()
                if default_cat:
                    categories.append(default_cat)
                    if standard_type_id and default_cat.type_id == standard_type_id:
                        standard_category_id = default_cat.id
                    link = PaymentItemCategoryLink(payment_item_id=item_id, category_id=default_cat.id)
                    session.add(link)
                    logger.info("Added UNCLASSIFIED category link")
            
            # update the standard_category_id field
            db_item.standard_category_id = standard_category_id
            logger.info(f"Set standard_category_id to {standard_category_id}")

        # 4. commit and refresh
        logger.info("Committing changes to database")
        session.add(db_item)
        session.commit()
        session.refresh(db_item)
        logger.info(f"Successfully updated payment item {item_id}")
        return db_item
        
    except Exception as e:
        logger.error(f"Error updating payment item {item_id}: {str(e)}")
        logger.error(f"Exception type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise


@app.delete("/payment-items/{item_id}", status_code=204)
def delete_payment_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    import os
    import logging
    
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    logger.info(f"Starting deletion of payment item {item_id}")
    
    item = session.get(PaymentItem, item_id)
    if not item:
        logger.error(f"Payment item {item_id} not found")
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this item")
    
    logger.info(f"Found payment item: {item}")
    
    # delete associated invoice file if it exists
    if item.invoice_path:
        file_path = INVOICE_DIR / item.invoice_path
        if file_path.exists():
            logger.info(f"Deleting invoice file: {file_path}")
            os.remove(file_path)
        else:
            logger.warning(f"Invoice file not found on disk: {file_path}")
    
    # also delete associated category links first (to avoid foreign key constraint issues)
    logger.info("Deleting associated category links")
    category_links = session.exec(
        select(PaymentItemCategoryLink).where(PaymentItemCategoryLink.payment_item_id == item_id)
    ).all()
    
    for link in category_links:
        logger.debug(f"Deleting category link: payment_item_id={link.payment_item_id}, category_id={link.category_id}")
        session.delete(link)
    
    # commit the category link deletions first
    session.commit()
    logger.info(f"Deleted {len(category_links)} category links")
    
    # now delete the payment item
    logger.info("Deleting payment item")
    session.delete(item)
    session.commit()
    
    logger.info(f"Successfully deleted payment item {item_id}")


# ═══════════════════════════════════════════════════════════════════
#  CATEGORY TYPE ENDPOINTS  (scoped to authenticated user)
# ═══════════════════════════════════════════════════════════════════

@app.post("/category-types", response_model=CategoryType)
def create_category_type(
    ct: CategoryType,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CategoryType:
    ct.user_id = current_user.id
    session.add(ct)
    session.commit()
    session.refresh(ct)
    return ct


@app.get("/category-types", response_model=List[CategoryType])
def list_category_types(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[CategoryType]:
    return session.exec(
        select(CategoryType).where(CategoryType.user_id == current_user.id)
    ).all()


# ═══════════════════════════════════════════════════════════════════
#  CATEGORY ENDPOINTS  (scoped to authenticated user)
# ═══════════════════════════════════════════════════════════════════

@app.post("/categories", response_model=Category)
def create_category(
    category: Category,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Category:
    normalized_name = _normalize_name(category.name)
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")

    # ensure the normalized name is unique within this user's categories
    existing_categories = session.exec(
        select(Category).where(Category.user_id == current_user.id)
    ).all()
    for existing in existing_categories:
        if _normalize_name(existing.name) == normalized_name:
            raise HTTPException(status_code=400, detail="Category name already exists")

    category.name = normalized_name
    category.user_id = current_user.id

    # Parent/type validation
    if category.parent_id and not session.get(Category, category.parent_id):
        raise HTTPException(status_code=404, detail="Parent category not found")
    if not session.get(CategoryType, category.type_id):
        raise HTTPException(status_code=404, detail="Category type not found")

    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@app.put("/categories/{category_id}", response_model=Category)
def update_category(
    category_id: int,
    category_update: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Category:
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this category")

    update_data = category_update.dict(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        normalized_name = _normalize_name(update_data["name"])
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Category name cannot be empty")

        existing_categories = session.exec(
            select(Category).where(Category.id != category_id, Category.user_id == current_user.id)
        ).all()
        for existing in existing_categories:
            if _normalize_name(existing.name) == normalized_name:
                raise HTTPException(status_code=400, detail="Category name already exists")

        update_data["name"] = normalized_name

    if "parent_id" in update_data and update_data["parent_id"] is not None:
        if not session.get(Category, update_data["parent_id"]):
            raise HTTPException(status_code=404, detail="Parent category not found")

    if "type_id" in update_data and update_data["type_id"] is not None:
        if not session.get(CategoryType, update_data["type_id"]):
            raise HTTPException(status_code=404, detail="Category type not found")

    for key, value in update_data.items():
        setattr(category, key, value)

    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@app.get("/categories/{category_id}", response_model=Category)
def get_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Category:
    """Get a single category by its ID."""
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this category")
    return category


@app.get("/categories/{category_id}/tree", response_model=Category)
def get_category_tree(
    category_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Category:
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this category")
    return category


@app.get("/categories/{category_id}/descendants", response_model=List[Category])
def list_category_descendants(
    category_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[Category]:
    root = session.get(Category, category_id)
    if not root:
        raise HTTPException(status_code=404, detail="Category not found")
    if root.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this category")
    descendants: List[Category] = []
    queue = [category_id]
    while queue:
        current = queue.pop(0)
        children = session.exec(select(Category).where(Category.parent_id == current)).all()
        for child in children:
            descendants.append(child)
            queue.append(child.id)
    return descendants


@app.get("/categories/by-type/{type_id}", response_model=List[Category])
def list_categories_by_type(
    type_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[Category]:
    return session.exec(
        select(Category).where(Category.type_id == type_id, Category.user_id == current_user.id)
    ).all()


@app.get("/categories", response_model=List[Category])
def list_all_categories(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[Category]:
    """Get all categories for the current user."""
    return session.exec(
        select(Category).where(Category.user_id == current_user.id)
    ).all()


# ═══════════════════════════════════════════════════════════════════
#  RECIPIENT ENDPOINTS  (scoped to authenticated user)
# ═══════════════════════════════════════════════════════════════════

@app.post("/recipients", response_model=Recipient)
def create_recipient(
    recipient: Recipient,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Recipient:
    normalized_name = _normalize_name(recipient.name)
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Recipient name cannot be empty")

    existing_recipients = session.exec(
        select(Recipient).where(Recipient.user_id == current_user.id)
    ).all()
    for existing in existing_recipients:
        if _normalize_name(existing.name) == normalized_name:
            raise HTTPException(status_code=400, detail="Recipient name already exists")

    recipient.name = normalized_name
    recipient.address = recipient.address.strip() if recipient.address else None
    recipient.user_id = current_user.id

    session.add(recipient)
    session.commit()
    session.refresh(recipient)
    return recipient


@app.get("/recipients", response_model=List[Recipient])
def list_recipients(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[Recipient]:
    return session.exec(
        select(Recipient).where(Recipient.user_id == current_user.id)
    ).all()


@app.get("/recipients/{recipient_id}", response_model=Recipient)
def get_recipient(
    recipient_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Recipient:
    """Fetch a single recipient by its ID."""
    recipient = session.get(Recipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this recipient")
    return recipient


@app.put("/recipients/{recipient_id}", response_model=Recipient)
def update_recipient(
    recipient_id: int,
    recipient_update: RecipientUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Recipient:
    recipient = session.get(Recipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this recipient")

    update_data = recipient_update.dict(exclude_unset=True)

    if "name" in update_data and update_data["name"] is not None:
        normalized_name = _normalize_name(update_data["name"])
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Recipient name cannot be empty")

        existing_recipients = session.exec(
            select(Recipient).where(Recipient.id != recipient_id, Recipient.user_id == current_user.id)
        ).all()
        for existing in existing_recipients:
            if _normalize_name(existing.name) == normalized_name:
                raise HTTPException(status_code=400, detail="Recipient name already exists")

        update_data["name"] = normalized_name

    if "address" in update_data:
        address_value = update_data["address"]
        update_data["address"] = address_value.strip() if address_value else None

    for key, value in update_data.items():
        setattr(recipient, key, value)

    session.add(recipient)
    session.commit()
    session.refresh(recipient)
    return recipient


# ═══════════════════════════════════════════════════════════════════
#  FILE UPLOAD ENDPOINTS  (with ownership checks)
# ═══════════════════════════════════════════════════════════════════

@app.post("/uploadicon/")
def upload_icon(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Save an uploaded icon file and return its filename."""
    # validate file type
    allowed_types = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/bmp': '.bmp',
        'image/svg+xml': '.svg'
    }
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type {file.content_type} not allowed. Supported types: PNG, JPEG, GIF, BMP, SVG"
        )
    
    file_path = ICON_DIR / file.filename
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"filename": file.filename}


@app.get("/download_static/{filename}")
def download_icon(filename: str) -> FileResponse:
    """Serve an uploaded icon file."""
    file_path = ICON_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)


@app.post("/upload-invoice/{payment_item_id}")
def upload_invoice(
    payment_item_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Upload an invoice file for a payment item."""
    import os
    import uuid
    
    # validate payment item exists and belongs to user
    payment_item = session.get(PaymentItem, payment_item_id)
    if not payment_item:
        raise HTTPException(status_code=404, detail="Payment item not found")
    if payment_item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to upload invoices for this item")
    
    # validate file type
    allowed_types = {
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/bmp': '.bmp',
        'image/tiff': '.tiff'
    }
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file.content_type} not allowed. Supported types: PDF, DOCX, DOC, JPEG, PNG, GIF, BMP, TIFF"
        )
    
    # validate file size (25MB limit)
    max_size = 25 * 1024 * 1024  # 25MB in bytes
    file_content = file.file.read()
    if len(file_content) > max_size:
        raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
    
    # reset file pointer
    file.file.seek(0)
    
    # delete existing invoice file if it exists
    if payment_item.invoice_path:
        old_file_path = INVOICE_DIR / payment_item.invoice_path
        if old_file_path.exists():
            os.remove(old_file_path)
    
    # generate unique filename
    file_extension = allowed_types[file.content_type]
    unique_filename = f"{payment_item_id}_{uuid.uuid4().hex}{file_extension}"
    file_path = INVOICE_DIR / unique_filename
    
    # save file
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # update payment item with invoice path
    payment_item.invoice_path = unique_filename
    session.add(payment_item)
    session.commit()
    
    return {
        "message": "Invoice uploaded successfully",
        "filename": unique_filename,
        "payment_item_id": payment_item_id
    }


@app.post("/import-csv")
def import_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Import payment items, recipients, and categories from an exported CSV file."""

    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a CSV file")

    try:
        raw_bytes = file.file.read()
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Unable to read uploaded file") from exc

    try:
        text_content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV file must be UTF-8 encoded")

    csv_stream = io.StringIO(text_content)
    reader = csv.reader(csv_stream, delimiter=";", quotechar='"')

    try:
        header_row = next(reader)
    except StopIteration:
        raise HTTPException(status_code=400, detail="Uploaded CSV file is empty")

    normalized_header = [cell.strip() for cell in header_row]
    if ";".join(normalized_header) != CSV_HEADER:
        raise HTTPException(status_code=400, detail="CSV header does not match the expected export format")

    parsed_rows = []
    for row_index, row in enumerate(reader, start=2):
        if not row or not any(cell.strip() for cell in row):
            continue  # ignore completely blank rows

        if len(row) != len(CSV_HEADER_FIELDS):
            raise HTTPException(
                status_code=400,
                detail=f"Row {row_index} does not match the expected format",
            )

        amount_str = row[0].strip()
        date_str = row[1].strip()
        raw_description = row[2].replace("\r\n", "\n").replace("\r", "\n")
        raw_recipient_name = row[3]
        raw_recipient_address = row[4].replace("\r\n", "\n").replace("\r", "\n")
        raw_category_name = row[5]
        periodic_str = row[6].strip().lower()

        description = raw_description.strip()
        recipient_name = raw_recipient_name.strip()
        recipient_address = raw_recipient_address.strip()
        category_name = raw_category_name.strip()

        if not AMOUNT_PATTERN.match(amount_str):
            raise HTTPException(status_code=400, detail=f"Row {row_index} has an invalid amount")
        if not DATE_PATTERN.match(date_str):
            raise HTTPException(status_code=400, detail=f"Row {row_index} has an invalid date")
        if not BOOLEAN_PATTERN.match(periodic_str):
            raise HTTPException(status_code=400, detail=f"Row {row_index} has an invalid periodic flag")

        if description and len(description) > MAX_DESCRIPTION_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Row {row_index} description exceeds {MAX_DESCRIPTION_LENGTH} characters"
                ),
            )
        if recipient_name and len(recipient_name) > MAX_RECIPIENT_NAME_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Row {row_index} recipient name exceeds {MAX_RECIPIENT_NAME_LENGTH} characters"
                ),
            )
        if recipient_address and len(recipient_address) > MAX_RECIPIENT_ADDRESS_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Row {row_index} recipient address exceeds {MAX_RECIPIENT_ADDRESS_LENGTH} characters"
                ),
            )
        if category_name and len(category_name) > MAX_CATEGORY_NAME_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Row {row_index} category name exceeds {MAX_CATEGORY_NAME_LENGTH} characters"
                ),
            )

        try:
            amount = float(amount_str)
        except ValueError as exc:  # pragma: no cover - guarded by regex
            raise HTTPException(status_code=400, detail=f"Row {row_index} contains an unreadable amount") from exc

        try:
            date_value = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Row {row_index} has an invalid date value")

        normalized_recipient = _normalize_name(recipient_name) if recipient_name else ""
        normalized_category = _normalize_name(category_name) if category_name else ""

        parsed_rows.append(
            {
                "amount": amount,
                "date": date_value,
                "description": description or None,
                "recipient_name": recipient_name,
                "recipient_address": recipient_address or None,
                "category_name": category_name,
                "periodic": periodic_str == "true",
                "normalized_recipient": normalized_recipient,
                "normalized_category": normalized_category,
            }
        )

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="CSV file does not contain any data rows")

    # Collect the latest recipient data for each unique name (last occurrence wins)
    recipient_import_data: dict[str, dict[str, Optional[str]]] = {}
    for row in parsed_rows:
        if row["normalized_recipient"]:
            recipient_import_data[row["normalized_recipient"]] = {
                "address": row["recipient_address"] if row["recipient_address"] else None
            }

    # Collect categories referenced in the CSV (only standard category is exported)
    category_names = {
        row["normalized_category"]
        for row in parsed_rows
        if row["normalized_category"]
    }

    # Fetch existing recipients and categories for THIS USER for deduplication
    existing_recipients = session.exec(
        select(Recipient).where(Recipient.user_id == current_user.id)
    ).all()
    recipient_lookup = {_normalize_name(rec.name): rec for rec in existing_recipients}

    existing_categories = session.exec(
        select(Category).where(Category.user_id == current_user.id)
    ).all()
    category_lookup = {_normalize_name(cat.name): cat for cat in existing_categories}

    standard_type = session.exec(
        select(CategoryType).where(CategoryType.name == "standard", CategoryType.user_id == current_user.id)
    ).first()
    if not standard_type:
        raise HTTPException(status_code=500, detail="Standard category type is not configured")

    default_category = session.exec(
        select(Category).where(Category.name == "UNCLASSIFIED", Category.user_id == current_user.id)
    ).first()

    created_recipients = 0
    updated_recipients = 0
    recipient_ids: dict[str, int] = {}

    for name, data in recipient_import_data.items():
        address = data["address"]
        existing = recipient_lookup.get(name)
        if existing:
            normalized_address = address if address else None
            if (existing.address or None) != normalized_address:
                existing.address = normalized_address
                session.add(existing)
                updated_recipients += 1
            recipient_ids[name] = existing.id
        else:
            new_recipient = Recipient(name=name, address=address, user_id=current_user.id)
            session.add(new_recipient)
            session.flush()
            recipient_ids[name] = new_recipient.id
            created_recipients += 1

    created_categories = 0
    category_ids_map: dict[str, int] = {}
    for name in category_names:
        existing_category = category_lookup.get(name)
        if existing_category:
            category_ids_map[name] = existing_category.id
            continue

        new_category = Category(name=name, type_id=standard_type.id, parent_id=None, user_id=current_user.id)
        session.add(new_category)
        session.flush()
        category_ids_map[name] = new_category.id
        created_categories += 1

    created_payments = 0

    for row in parsed_rows:
        recipient_id = None
        if row["normalized_recipient"]:
            recipient_id = recipient_ids.get(row["normalized_recipient"])

        category_id = None
        if row["normalized_category"]:
            category_id = category_ids_map.get(row["normalized_category"])
        elif default_category:
            category_id = default_category.id

        payment_item = PaymentItem(
            amount=row["amount"],
            date=row["date"],
            periodic=row["periodic"],
            description=row["description"],
            recipient_id=recipient_id,
            standard_category_id=category_id,
            user_id=current_user.id,
        )
        session.add(payment_item)
        session.flush()

        if category_id:
            link = PaymentItemCategoryLink(payment_item_id=payment_item.id, category_id=category_id)
            session.add(link)

        created_payments += 1

    session.commit()

    return {
        "created_payments": created_payments,
        "created_recipients": created_recipients,
        "updated_recipients": updated_recipients,
        "created_categories": created_categories,
    }


@app.get("/download-invoice/{payment_item_id}")
def download_invoice(
    payment_item_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FileResponse:
    """Download the invoice file for a payment item."""
    # validate payment item exists
    payment_item = session.get(PaymentItem, payment_item_id)
    if not payment_item:
        raise HTTPException(status_code=404, detail="Payment item not found")
    if payment_item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")
    
    if not payment_item.invoice_path:
        raise HTTPException(status_code=404, detail="No invoice file found for this payment item")
    
    file_path = INVOICE_DIR / payment_item.invoice_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Invoice file not found on disk")
    
    return FileResponse(
        file_path,
        filename=f"invoice_{payment_item_id}_{payment_item.invoice_path}",
        media_type='application/octet-stream'
    )


@app.delete("/invoice/{payment_item_id}")
def delete_invoice(
    payment_item_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Delete the invoice file for a payment item."""
    import os
    
    # validate payment item exists
    payment_item = session.get(PaymentItem, payment_item_id)
    if not payment_item:
        raise HTTPException(status_code=404, detail="Payment item not found")
    if payment_item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this invoice")
    
    if not payment_item.invoice_path:
        raise HTTPException(status_code=404, detail="No invoice file found for this payment item")
    
    # delete file from disk
    file_path = INVOICE_DIR / payment_item.invoice_path
    if file_path.exists():
        os.remove(file_path)
    
    # clear invoice path from database
    payment_item.invoice_path = None
    session.add(payment_item)
    session.commit()
    
    return {"message": "Invoice deleted successfully"}


# ═══════════════════════════════════════════════════════════════════
#  ADMIN WEBSITE  (Jinja2 server-side rendered)
# ═══════════════════════════════════════════════════════════════════

# The admin website is mounted from a separate module to keep main.py clean
from app.admin import admin_router  # noqa: E402
app.include_router(admin_router)
