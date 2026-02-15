/**
 * Domain TypeScript definitions shared across the entire web-front-end.
 *
 *  These interfaces are intentionally kept in sync with the Pydantic/SQLModel
 *  schemas exposed by the FastAPI backend (see 'app/models.py'). By colocating
 *  them in a single module we avoid cyclic imports and gain a single source of
 *  truth for the shape of API data.
 *
 *  Keep breaking changes backwards-compatible where possible!  Persisted
 *  production data depends on these contracts.
 */

export interface UserRead {
  id: number;
  username: string;
  surname: string;
  prename: string;
  birth_date?: string | null;
  phone?: string | null;
  road?: string | null;
  house_number?: string | null;
  region?: string | null;
  postal?: string | null;
  city?: string | null;
  state?: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Recipient {
  id: number;
  name: string;
  address?: string | null;
}

/**
 * A Category is part of a "tree" that belongs to a 'CategoryType'. Every
 * category may have a parent (null for roots) and any number of children. The
 * backend sends children recursively so the front-end can build a tree view.
 */
export interface Category {
  id: number;
  name: string;
  type_id: number;
  parent_id?: number | null;
  icon_file?: string | null;
  children?: Category[]; // FastAPI includes nested sets
}

/** Classification type, e.g. "Expense Type", "Payment Method". */
export interface CategoryType {
  id: number;
  name: string;
  description?: string | null;
}

/**
 * Top-level cash-flow record.
 * A positive amount is an income, a negative amount an expense.
 */
export interface PaymentItem {
  id: number;
  amount: number; // stored in decimal(10,2) on the server
  date: string; // is of the form "2025-06-06T13:37:00+02:00"
  periodic: boolean;
  description?: string | null; // description of what this payment is for

  // Relations
  recipient_id?: number | null;
  recipient?: Recipient | null;

  categories?: Category[]; // resolved by backend JOIN
  standard_category_id?: number | null; // direct reference to standard type category for icon display
  standard_category?: Category | null; // resolved standard category object
  attachment_url?: string | null; // presigned link to image/PDF on object-store
  invoice_path?: string | null; // filename of uploaded invoice document
}

/** Helper to distinguish incomes and expenses on the client. */
export const isExpense = (item: PaymentItem): boolean => item.amount < 0;
export const isIncome = (item: PaymentItem): boolean => item.amount >= 0;

/**
 * Aggregation result returned by 'GET /payment-items?aggregate=true' (to be
 * implemented later).
 */
export interface SummaryTotals {
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

/**
 * Represents the data structure submitted from the PaymentItemForm.
 * It uses 'category_ids' instead of the full 'categories' array of objects.
 * This aligns with the 'PaymentItemCreate' and 'PaymentItemUpdate' schemas on the backend.
 */
export type PaymentItemFormData = {
  id?: number;
  amount: number;
  date: string;
  periodic: boolean;
  description?: string | null;
  recipient_id?: number | null;
  category_ids?: number[];
  standard_category_id?: number | null;
  attachment_url?: string | null;
};
