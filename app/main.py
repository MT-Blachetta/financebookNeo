from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
from sqlmodel import Session, select

from app.database import create_db_and_tables, get_session
from app.models import (
    PaymentItem,
    PaymentItemCreate,
    PaymentItemRead,
    PaymentItemUpdate,
    CategoryType,
    Category,
    CategoryUpdate,
    Recipient,
    PaymentItemCategoryLink, # import for joining
)

app = FastAPI(title="FinanceBook API", version="0.1.0")

# directory where uploaded category icon files are stored
ICON_DIR = Path("icons")
ICON_DIR.mkdir(exist_ok=True)

# directory where uploaded invoice files are stored
INVOICE_DIR = Path("app/invoices")
INVOICE_DIR.mkdir(exist_ok=True)


@app.on_event("startup")
def on_startup() -> None:
    """Create tables on first run and initialize default data."""
    create_db_and_tables()
    initialize_default_data()


def initialize_default_data() -> None:
    """Initialize default data like the 'standard' category type."""
    from app.database import engine
    with Session(engine) as session:
        # check if 'standard' category type already exists
        standard_type = session.exec(
            select(CategoryType).where(CategoryType.name == "standard")
        ).first()
        
        if not standard_type:
            # create the default 'standard' category type
            standard_type = CategoryType(
                name="standard",
                description="Default category type for basic expense/income classification"
            )
            session.add(standard_type)
            session.commit()
            session.refresh(standard_type)

        # create default 'UNCLASSIFIED' category if it doesn't exist
        unclassified = session.exec(
            select(Category).where(Category.name == "UNCLASSIFIED")
        ).first()
        if not unclassified:
            unclassified = Category(
                name="UNCLASSIFIED",
                type_id=standard_type.id,
                parent_id=None,
            )
            session.add(unclassified)
            session.commit()




@app.post("/payment-items", response_model=PaymentItemRead)
def create_payment_item(
    item_create: PaymentItemCreate,
    session: Session = Depends(get_session),
) -> PaymentItem:
    # 1. Validate recipient if provided
    if item_create.recipient_id:
        recipient = session.get(Recipient, item_create.recipient_id)
        if not recipient:
            raise HTTPException(status_code=404, detail=f"Recipient with id {item_create.recipient_id} not found")

    # 2. Get standard type ID for later use
    standard_type = session.exec(select(CategoryType).where(CategoryType.name == "standard")).first()
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
            if category.type_id in seen_types:
                raise HTTPException(status_code=400, detail="Only one category per type is allowed")
            seen_types.add(category.type_id)
            category_ids.append(cat_id)
            
            # Set standard_category_id if this is a standard type category
            if standard_type_id and category.type_id == standard_type_id:
                standard_category_id = cat_id
    else:
        # Assign the default UNCLASSIFIED category
        default_cat = session.exec(select(Category).where(Category.name == "UNCLASSIFIED")).first()
        if default_cat:
            category_ids.append(default_cat.id)
            if standard_type_id and default_cat.type_id == standard_type_id:
                standard_category_id = default_cat.id

    # 4. Create PaymentItem instance from the payload
    item_data = item_create.dict(exclude={"category_ids"})
    item_data["standard_category_id"] = standard_category_id
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
    session: Session = Depends(get_session),
) -> List[PaymentItem]:
    import logging
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    if expense_only and income_only:
        raise HTTPException(status_code=400, detail="Choose only one filter: expense_only or income_only")

    query = select(PaymentItem)
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
        # We use a subquery to find payment item IDs that have at least one of the selected categories
        subquery = (
            select(PaymentItemCategoryLink.payment_item_id)
            .where(PaymentItemCategoryLink.category_id.in_(expanded_ids))
            .distinct()
        )
        
        # Filter the main query to only include payment items found in the subquery
        query = query.where(PaymentItem.id.in_(subquery))
        
        logger.info(f"Generated explicit OR logic query for category filtering")

    results = session.exec(query).all()
    logger.info(f"Found {len(results)} payment items matching the filters")
    
    return results


@app.get("/payment-items/{item_id}", response_model=PaymentItemRead)
def get_payment_item(item_id: int, session: Session = Depends(get_session)) -> PaymentItem:
    item = session.get(PaymentItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.put("/payment-items/{item_id}", response_model=PaymentItemRead)
def update_payment_item(
    item_id: int,
    item_update: PaymentItemUpdate,
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

        logger.info(f"Found existing item: {db_item}")

        # 1. Update standard fields
        update_data = item_update.dict(exclude_unset=True)
        logger.info(f"Processing standard fields: {[k for k in update_data.keys() if k != 'category_ids']}")
        
        for key, value in update_data.items():
            if key != "category_ids": # defer category update
                logger.debug(f"Setting {key} = {value}")
                setattr(db_item, key, value)

        # 2. Validate and update recipient if provided
        if item_update.recipient_id:
            logger.info(f"Validating recipient {item_update.recipient_id}")
            recipient = session.get(Recipient, item_update.recipient_id)
            if not recipient:
                logger.error(f"Recipient {item_update.recipient_id} not found")
                raise HTTPException(status_code=404, detail=f"Recipient with id {item_update.recipient_id} not found")
            db_item.recipient_id = item_update.recipient_id
            logger.info(f"Recipient updated successfully")

        # 3. Validate and update categories if provided
        if item_update.category_ids is not None:
            logger.info(f"Processing categories: {item_update.category_ids}")
            
            # get standard type ID for later use
            standard_type = session.exec(select(CategoryType).where(CategoryType.name == "standard")).first()
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
                default_cat = session.exec(select(Category).where(Category.name == "UNCLASSIFIED")).first()
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
def delete_payment_item(item_id: int, session: Session = Depends(get_session)) -> None:
    import os
    import logging
    
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    logger.info(f"Starting deletion of payment item {item_id}")
    
    item = session.get(PaymentItem, item_id)
    if not item:
        logger.error(f"Payment item {item_id} not found")
        raise HTTPException(status_code=404, detail="Item not found")
    
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


@app.post("/category-types", response_model=CategoryType)
def create_category_type(
    ct: CategoryType, session: Session = Depends(get_session)
) -> CategoryType:
    session.add(ct)
    session.commit()
    session.refresh(ct)
    return ct


@app.get("/category-types", response_model=List[CategoryType])
def list_category_types(session: Session = Depends(get_session)) -> List[CategoryType]:
    return session.exec(select(CategoryType)).all()



@app.post("/categories", response_model=Category)
def create_category(category: Category, session: Session = Depends(get_session)) -> Category:
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
    session: Session = Depends(get_session),
) -> Category:
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    update_data = category_update.dict(exclude_unset=True)

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
def get_category(category_id: int, session: Session = Depends(get_session)) -> Category:
    """Get a single category by its ID."""
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@app.get("/categories/{category_id}/tree", response_model=Category)
def get_category_tree(category_id: int, session: Session = Depends(get_session)) -> Category:
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    # children are lazy-loaded, FastAPI serialises recursively
    return category


@app.get("/categories/{category_id}/descendants", response_model=List[Category])
def list_category_descendants(category_id: int, session: Session = Depends(get_session)) -> List[Category]:
    root = session.get(Category, category_id)
    if not root:
        raise HTTPException(status_code=404, detail="Category not found")
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
    type_id: int, session: Session = Depends(get_session)
) -> List[Category]:
    return session.exec(select(Category).where(Category.type_id == type_id)).all()


@app.get("/categories", response_model=List[Category])
def list_all_categories(session: Session = Depends(get_session)) -> List[Category]:
    """Get all categories regardless of their type."""
    return session.exec(select(Category)).all()


@app.post("/recipients", response_model=Recipient)
def create_recipient(recipient: Recipient, session: Session = Depends(get_session)) -> Recipient:
    session.add(recipient)
    session.commit()
    session.refresh(recipient)
    return recipient


@app.get("/recipients", response_model=List[Recipient])
def list_recipients(session: Session = Depends(get_session)) -> List[Recipient]:
    return session.exec(select(Recipient)).all()


@app.get("/recipients/{recipient_id}", response_model=Recipient)
def get_recipient(
    recipient_id: int, session: Session = Depends(get_session)
) -> Recipient:
    """Fetch a single recipient by its ID."""
    recipient = session.get(Recipient, recipient_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return recipient


@app.post("/uploadicon/")
def upload_icon(file: UploadFile = File(...)) -> dict:
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
    session: Session = Depends(get_session),
) -> dict:
    """Upload an invoice file for a payment item."""
    import os
    import uuid
    
    # validate payment item exists
    payment_item = session.get(PaymentItem, payment_item_id)
    if not payment_item:
        raise HTTPException(status_code=404, detail="Payment item not found")
    
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


@app.get("/download-invoice/{payment_item_id}")
def download_invoice(
    payment_item_id: int,
    session: Session = Depends(get_session),
) -> FileResponse:
    """Download the invoice file for a payment item."""
    # validate payment item exists
    payment_item = session.get(PaymentItem, payment_item_id)
    if not payment_item:
        raise HTTPException(status_code=404, detail="Payment item not found")
    
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
    session: Session = Depends(get_session),
) -> dict:
    """Delete the invoice file for a payment item."""
    import os
    
    # validate payment item exists
    payment_item = session.get(PaymentItem, payment_item_id)
    if not payment_item:
        raise HTTPException(status_code=404, detail="Payment item not found")
    
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
