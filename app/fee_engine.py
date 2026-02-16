"""
Transaction fee computation engine for FinanceBook.

Provides functions to compute, apply, refund and recompute transaction
fees for payment items based on each user's fee plan.

Two fee-plan modes are supported:
  • **table**  – amount-table intervals with per-interval regression curves
  • **formula** – a single mathematical expression *f(x, y)*
"""
from __future__ import annotations

import ast
import json
import logging
import math
import operator
from typing import Optional, Tuple

import numpy as np
from sqlmodel import Session, select

from app.models import PaymentItem, TransactionFeePlan, TransactionFeeRecord

logger = logging.getLogger(__name__)

# Operators allowed in safe_eval_formula
_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_SAFE_FUNCTIONS = {
    "abs": abs,
    "min": min,
    "max": max,
    "sqrt": math.sqrt,
    "log": math.log,
    "sin": math.sin,
    "cos": math.cos,
}


# ─── Safe formula evaluation ────────────────────────────────────────

def safe_eval_formula(formula_text: str, x: float, y: float) -> Optional[float]:
    """Safely evaluate a mathematical expression with variables *x* and *y*.

    Uses the ``ast`` module instead of ``eval()`` to prevent code injection.
    Returns ``None`` if the expression is invalid or evaluation fails.
    """
    try:
        tree = ast.parse(formula_text, mode="eval")
        return _eval_node(tree.body, {"x": x, "y": y})
    except Exception:
        return None


def validate_formula(formula_text: str) -> bool:
    """Return True if *formula_text* is a syntactically valid expression."""
    try:
        tree = ast.parse(formula_text, mode="eval")
        # Try evaluating with dummy values to ensure it works
        result = _eval_node(tree.body, {"x": 1.0, "y": 0.5})
        return result is not None and math.isfinite(result)
    except Exception:
        return False


def _eval_node(node, variables: dict) -> float:
    """Recursively evaluate an AST node."""
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("Only numeric constants allowed")
    elif isinstance(node, ast.Name):
        if node.id in variables:
            return variables[node.id]
        raise ValueError(f"Unknown variable: {node.id}")
    elif isinstance(node, ast.BinOp):
        op_fn = _SAFE_OPERATORS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        left = _eval_node(node.left, variables)
        right = _eval_node(node.right, variables)
        if op_fn is operator.truediv and right == 0:
            return 0.0  # division by zero -> 0
        return op_fn(left, right)
    elif isinstance(node, ast.UnaryOp):
        op_fn = _SAFE_OPERATORS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        return op_fn(_eval_node(node.operand, variables))
    elif isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name) and node.func.id in _SAFE_FUNCTIONS:
            args = [_eval_node(arg, variables) for arg in node.args]
            return _SAFE_FUNCTIONS[node.func.id](*args)
        raise ValueError("Function calls not supported")
    else:
        raise ValueError(f"Unsupported AST node: {type(node).__name__}")


# ─── Payment frequency ──────────────────────────────────────────────

def get_payment_frequency(
    user_id: int,
    lower_bound: float,
    upper_bound: Optional[float],
    session: Session,
) -> float:
    """Compute the fraction of the user's payments whose absolute amount
    falls within ``[lower_bound, upper_bound)``.

    If *upper_bound* is ``None`` the range is ``[lower_bound, ∞)``.
    Returns 0.0 when the user has no payments at all.
    """
    total_q = select(PaymentItem).where(PaymentItem.user_id == user_id)
    total_count = len(session.exec(total_q).all())
    if total_count == 0:
        return 0.0

    # Build filtered query
    from sqlalchemy import func as sa_func
    filtered_q = (
        select(PaymentItem)
        .where(PaymentItem.user_id == user_id)
        .where(sa_func.abs(PaymentItem.amount) >= lower_bound)
    )
    if upper_bound is not None:
        filtered_q = filtered_q.where(sa_func.abs(PaymentItem.amount) < upper_bound)

    filtered_count = len(session.exec(filtered_q).all())
    return filtered_count / total_count


# ─── Regression helpers ─────────────────────────────────────────────

def compute_regression_coefficients(
    points: list[dict],
    max_fee: float,
) -> list[float]:
    """Compute polynomial regression coefficients from user-clicked points.

    Returns coefficients ``[c0, c1, c2, …]`` such that
    ``f(x) = c0 + c1*x + c2*x² + …``.

    Corner cases handled:
      • **0 points** → identity function scaled to max_fee: ``f(x) = max_fee * x``
        (coefficients ``[0, max_fee]``)
      • **1 point** ``(x1, y1)`` → ``f(x) = x * (y1 / x1)``  (divide-by-zero safe)
      • **2 points** → ``f(x) = x * ((y2 - y1) / (x2 - x1))``
      • **3+ points** → numpy polynomial regression (degree = min(len-1, 5))
    """
    if not points or len(points) == 0:
        # Identity scaled to max_fee
        return [0.0, max_fee]

    if len(points) == 1:
        x1, y1 = points[0]["freq"], points[0]["fee"]
        if x1 == 0:
            return [0.0, max_fee]  # can't determine slope, use identity
        slope = y1 / x1
        return [0.0, slope]

    if len(points) == 2:
        x1, y1 = points[0]["freq"], points[0]["fee"]
        x2, y2 = points[1]["freq"], points[1]["fee"]
        if x2 == x1:
            return [0.0, max_fee]
        slope = (y2 - y1) / (x2 - x1)
        return [0.0, slope]

    # 3+ points: polynomial regression
    xs = np.array([p["freq"] for p in points])
    ys = np.array([p["fee"] for p in points])
    degree = min(len(points) - 1, 5)
    coeffs = np.polyfit(xs, ys, degree)
    # polyfit returns highest degree first, reverse for our convention
    return list(reversed(coeffs.tolist()))


def evaluate_regression(coefficients: list[float], x: float) -> float:
    """Evaluate a polynomial given coefficients ``[c0, c1, c2, …]``."""
    result = 0.0
    for i, c in enumerate(coefficients):
        result += c * (x ** i)
    return result


# ─── Core fee computation ────────────────────────────────────────────

def compute_fee(
    amount: float,
    user_id: int,
    session: Session,
) -> float:
    """Compute the transaction fee for a given payment *amount*.

    Returns a positive fee value (or 0 if no fee applies).  The fee can
    never exceed the absolute value of the payment (capped at 100%).
    """
    abs_amount = abs(amount)

    # Load fee plan
    plan = session.exec(
        select(TransactionFeePlan).where(TransactionFeePlan.user_id == user_id)
    ).first()

    if not plan:
        return 0.0  # no fee plan → no fees

    fee = 0.0

    if plan.mode == "formula":
        # Formula mode
        if not plan.formula_text:
            return 0.0
        freq = get_payment_frequency(user_id, 0, None, session)
        raw = safe_eval_formula(plan.formula_text, abs_amount, freq)
        if raw is None:
            return 0.0
        fee = abs(raw)

    elif plan.mode == "table":
        # Table mode
        amount_table = json.loads(plan.amount_table_json)
        interval_data = json.loads(plan.interval_data_json)

        if len(amount_table) <= 1 and not interval_data:
            return 0.0  # default table [0] with no interval data

        # Find which interval the amount falls into
        interval_key = None
        lower = 0.0
        upper = None
        for i in range(len(amount_table)):
            lo = amount_table[i]
            hi = amount_table[i + 1] if i + 1 < len(amount_table) else None
            if hi is None:
                # Last interval [lo, ∞)
                if abs_amount >= lo:
                    interval_key = str(lo)
                    lower = lo
                    upper = None
                    break
            else:
                if lo <= abs_amount < hi:
                    interval_key = str(lo)
                    lower = lo
                    upper = hi
                    break

        if interval_key is None:
            return 0.0

        idata = interval_data.get(interval_key, {})
        if not idata:
            return 0.0

        max_fee_pct = idata.get("maxFee", 0.1)
        coefficients = idata.get("coefficients", None)

        if coefficients is None:
            return 0.0

        # Compute payment frequency for this interval
        freq = get_payment_frequency(user_id, lower, upper, session)

        # Evaluate regression
        raw_fee_pct = evaluate_regression(coefficients, freq)
        # Clamp to [0, max_fee_pct]
        raw_fee_pct = max(0.0, min(raw_fee_pct, max_fee_pct))
        fee = abs_amount * raw_fee_pct

    # Cap fee at 100% of absolute amount
    fee = min(fee, abs_amount)

    # Round to 2 decimal places
    fee = round(fee, 2)

    # If rounded fee < 0.01, no fee is charged
    if fee < 0.01:
        return 0.0

    return fee


def apply_fee_to_amount(amount: float, fee: float) -> float:
    """Apply a fee to a payment amount.

    • Positive amount (income): ``amount - fee``
    • Negative amount (expense): ``amount - fee``  (e.g. ``-100 - 0.01 = -100.01``)
    """
    if amount >= 0:
        return round(amount - fee, 2)
    else:
        return round(amount - fee, 2)


# ─── High-level helpers for CRUD endpoints ──────────────────────────

def create_fee_record(
    payment_item: PaymentItem,
    user_id: int,
    session: Session,
) -> Tuple[float, float]:
    """Compute and record the fee for a newly created payment item.

    Returns ``(fee_amount, adjusted_amount)``.
    """
    original_amount = payment_item.amount
    fee = compute_fee(original_amount, user_id, session)

    if fee > 0:
        adjusted = apply_fee_to_amount(original_amount, fee)
        payment_item.amount = adjusted
        session.add(payment_item)

        record = TransactionFeeRecord(
            payment_item_id=payment_item.id,
            user_id=user_id,
            fee_amount=fee,
            original_amount=original_amount,
        )
        session.add(record)
        session.commit()
        session.refresh(payment_item)
        return fee, adjusted

    return 0.0, original_amount


def refund_fee_record(
    payment_item_id: int,
    session: Session,
) -> float:
    """Refund fee for a deleted payment item.

    Returns the fee amount that was refunded (0 if no fee was recorded).
    """
    record = session.exec(
        select(TransactionFeeRecord).where(
            TransactionFeeRecord.payment_item_id == payment_item_id
        )
    ).first()

    if record:
        fee = record.fee_amount
        session.delete(record)
        session.commit()
        return fee

    return 0.0


def recompute_fee_record(
    payment_item: PaymentItem,
    new_amount: float,
    user_id: int,
    session: Session,
) -> Tuple[float, float]:
    """Recompute fee when a payment's amount is updated.

    Returns ``(new_fee, adjusted_amount)``.
    """
    # Find existing fee record
    existing_record = session.exec(
        select(TransactionFeeRecord).where(
            TransactionFeeRecord.payment_item_id == payment_item.id
        )
    ).first()

    # Compute new fee based on the new raw amount
    new_fee = compute_fee(new_amount, user_id, session)
    adjusted = apply_fee_to_amount(new_amount, new_fee) if new_fee > 0 else new_amount

    if existing_record:
        if new_fee > 0:
            existing_record.fee_amount = new_fee
            existing_record.original_amount = new_amount
            session.add(existing_record)
        else:
            session.delete(existing_record)
    elif new_fee > 0:
        record = TransactionFeeRecord(
            payment_item_id=payment_item.id,
            user_id=user_id,
            fee_amount=new_fee,
            original_amount=new_amount,
        )
        session.add(record)

    payment_item.amount = adjusted
    session.add(payment_item)
    session.commit()
    session.refresh(payment_item)

    return new_fee, adjusted
