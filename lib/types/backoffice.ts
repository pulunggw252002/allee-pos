/**
 * TypeScript types untuk integrasi POS ↔ Backoffice ALLEE.
 *
 * Source of truth: `Backoffice ALLEE/docs/pos-api-contract.md` v1.1 (2026-04-25).
 *
 * Konvensi:
 *  - snake_case di field name → match exact shape backoffice JSON. Tidak
 *    di-rewrite ke camelCase supaya `JSON.parse` langsung jadi typed object.
 *  - ID = string opaque, prefix-based (`mnu_*`, `out_*`, `tx_*`, …). Treat as opaque.
 *  - Currency = integer Rupiah (no decimals).
 *  - Quantity bahan = number (boleh desimal).
 *  - Date/time = ISO-8601 UTC string.
 */

// --- Common ---------------------------------------------------------------

export type BackofficeRole =
  | "owner"
  | "kepala_toko"
  | "kasir"
  | "barista"
  | "kitchen"
  | "waiters";

export type BackofficeOrderType = "dine_in" | "take_away" | "delivery" | "online";

export type BackofficePaymentMethod = "cash" | "qris" | "card" | "transfer";

export type BackofficeTransactionStatus = "paid" | "open" | "void";

export interface BackofficeError {
  error: string;
  details?: unknown;
}

// --- §2.4 Session ---------------------------------------------------------

export interface BackofficeSession {
  id: string;
  name: string;
  role: BackofficeRole;
  outlet_id: string;
  email: string;
}

// --- §3.1 Outlets ---------------------------------------------------------

export interface BackofficeOutlet {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  opening_hours: string;
  is_active: boolean;
  created_at: string;
}

// --- §3.4 Categories ------------------------------------------------------

export interface BackofficeCategory {
  id: string;
  name: string;
  sort_order: number;
}

// --- §3.2 Menus -----------------------------------------------------------

export interface BackofficeRecipeItem {
  id: string;
  menu_id: string;
  ingredient_id: string;
  quantity: number;
  notes: string | null;
}

export interface BackofficeMenu {
  id: string;
  category_id: string;
  name: string;
  sku: string;
  price: number;
  hpp_cached: number;
  photo_url: string | null;
  description: string | null;
  type: "regular" | string;
  is_active: boolean;
  outlet_ids: string[];
  recipes: BackofficeRecipeItem[];
  addon_group_ids: string[];
}

// --- §3.5 Addon groups ----------------------------------------------------

export interface BackofficeAddonModifier {
  id: string;
  addon_option_id: string;
  ingredient_id: string;
  quantity_delta: number;
  mode: "delta" | "override";
}

export interface BackofficeAddonOption {
  id: string;
  addon_group_id: string;
  name: string;
  extra_price: number;
  modifiers: BackofficeAddonModifier[];
}

export interface BackofficeAddonGroup {
  id: string;
  name: string;
  selection_type: "single" | "multi";
  is_required: boolean;
  options: BackofficeAddonOption[];
}

// --- §3.6 Bundles ---------------------------------------------------------

export interface BackofficeBundleItem {
  bundle_id: string;
  menu_id: string;
  quantity: number;
}

export interface BackofficeBundle {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  outlet_ids: string[];
  items: BackofficeBundleItem[];
}

// --- §3.7 Discounts -------------------------------------------------------

export interface BackofficeDiscount {
  id: string;
  name: string;
  type: "percent" | "nominal";
  value: number;
  scope: "all" | "category" | "menu";
  scope_ref_id: string | null;
  active_hour_start: string | null;
  active_hour_end: string | null;
  is_active: boolean;
}

// --- §3.8 Ingredients -----------------------------------------------------

export interface BackofficeIngredient {
  id: string;
  outlet_id: string;
  name: string;
  unit: string;
  unit_price: number;
  current_stock: number;
  min_qty: number;
  storage_location: string | null;
  updated_at: string;
}

// --- §3.9 Tax settings ----------------------------------------------------

export interface BackofficeTaxSettings {
  ppn_percent: number;
  service_charge_percent: number;
  updated_at: string;
}

// --- §3.10 Users ----------------------------------------------------------

export interface BackofficeUser {
  id: string;
  name: string;
  role: BackofficeRole;
  outlet_id: string;
  /**
   * GET /api/users di backoffice TIDAK mengembalikan email — itu disimpan
   * di tabel `user_auth` (Better Auth) terpisah dari domain user. POS
   * synthesize email di sync.ts pakai slug name (`<name-slug>@allee.local`)
   * supaya cocok dengan format yang seed backoffice pakai.
   */
  email?: string;
  /** Selalu di-redact: "***" atau null. Jangan pernah trust value selain itu. */
  pos_pin: "***" | null;
}

// --- §4.1 / §4.3 Transactions --------------------------------------------

export interface BackofficeTransactionItemAddon {
  addon_option_id: string;
  name_snapshot: string;
  extra_price: number;
}

/**
 * Item yang dikirim POS saat POST /api/transactions.
 * Tepat satu dari `menu_id` ATAU `bundle_id` harus di-isi.
 */
export interface BackofficeCreateTransactionItem {
  menu_id: string | null;
  bundle_id: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  hpp_snapshot: number;
  /** (unit_price + Σ addon.extra_price) * quantity. Server cross-check ±1 IDR. */
  subtotal: number;
  addons: BackofficeTransactionItemAddon[];
}

export interface BackofficeCreateTransactionInput {
  /** POS-generated. Idempotency key — re-POST id sama → return existing. */
  id: string;
  outlet_id: string;
  payment_method: BackofficePaymentMethod;
  order_type: BackofficeOrderType;
  /** Default "paid"; "open" untuk simpan-tahan. */
  status?: BackofficeTransactionStatus;
  subtotal: number;
  discount_total: number;
  ppn_amount: number;
  service_charge_amount: number;
  grand_total: number;
  /** Optional. Default: server pakai nowIso(). */
  created_at?: string;
  items: BackofficeCreateTransactionItem[];
}

/** Shape item yang dibalikin GET /api/transactions[/:id] (v1.1 punya field void). */
export interface BackofficeTransactionItem {
  id: string;
  transaction_id: string;
  menu_id: string | null;
  bundle_id: string | null;
  name_snapshot: string;
  quantity: number;
  unit_price: number;
  hpp_snapshot: number;
  subtotal: number;
  /** null kalau item masih aktif. */
  voided_at: string | null;
  /** user.id yang melakukan void. */
  voided_by: string | null;
  void_reason: string | null;
  addons: BackofficeTransactionItemAddon[];
}

export interface BackofficeTransaction {
  id: string;
  outlet_id: string;
  payment_method: BackofficePaymentMethod;
  order_type: BackofficeOrderType;
  status: BackofficeTransactionStatus;
  subtotal: number;
  discount_total: number;
  ppn_amount: number;
  service_charge_amount: number;
  grand_total: number;
  created_at: string;
  items: BackofficeTransactionItem[];
}

// --- §4.2 Void responses --------------------------------------------------

export interface BackofficeVoidItemResponse {
  ok: true;
  item_id: string;
  voided_at: string;
}

export interface BackofficeVoidTransactionResponse {
  ok: true;
  voided_count: number;
}
