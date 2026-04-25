import { relations, sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";

/* ---------- Better Auth tables (session/account + custom role/pin) ---------- */

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["cashier", "supervisor"] }).notNull().default("cashier"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

/* ---------- System / sync metadata ---------- */

/**
 * Key-value store untuk metadata sistem yg butuh persistence antar cold-start
 * (mis. "last_synced_at" agar SWR-style auto-sync tidak trigger sync di setiap
 * cold-start tapi tau persis kapan terakhir sync sukses).
 */
export const systemMeta = sqliteTable("system_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Outbox untuk push backoffice yang gagal (network down, timeout, dll).
 * Sebelum perubahan ini, `pushTransactionBestEffort` swallow error & log
 * console — kalau backoffice down saat kasir bayar, transaksi orphan di
 * POS DB selamanya (tidak pernah masuk ke laporan backoffice).
 *
 * Sekarang: setiap push gagal kita simpan payload-nya di sini, lalu di-drain
 * via `POST /api/sync/retry` (manual atau dipanggil otomatis saat
 * `/api/backoffice/sync` dijalankan SWR-style).
 *
 * Idempotency aman karena:
 *  - kind="transaction" pakai POS order id sebagai key di backoffice.
 *  - kind="void_item" tuple-match (productId+name+qty+price) — POS bisa
 *    re-push tanpa double-void.
 *  - kind="void_transaction" backoffice skip kalau status sudah void.
 *  - kind="shift_summary" PK = shift id.
 */
export const syncOutbox = sqliteTable("sync_outbox", {
  id: text("id").primaryKey(),
  kind: text("kind", {
    enum: ["transaction", "void_item", "void_transaction", "shift_summary"],
  }).notNull(),
  /** ID entity yang di-push (order id, shift id) — buat dedup di UI. */
  refId: text("ref_id").notNull(),
  /** JSON payload — input untuk `pushXxx()`. */
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  lastTriedAt: integer("last_tried_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/* ---------- Catalog (pushed down from backoffice) ---------- */

/**
 * Outlets cache — di-sync dari backoffice GET /api/outlets. POS biasanya cuma
 * pakai 1 outlet aktif (resolved via NEXT_PUBLIC_OUTLET_ID env), tapi tabel
 * ini menyimpan SEMUA outlet biar:
 *  - Owner / multi-outlet user bisa switch di POS.
 *  - Receipt header & footer di-render dari data outlet aktif (brand, address,
 *    phone, dll), bukan dari hardcoded `pos-config.ts`.
 *  - Tax/service rate per-outlet (kalau backoffice mau extend) tinggal nambah
 *    kolom di sini.
 *
 * Source of truth tetap backoffice. POS hanya read (sync). Mutation di POS
 * tidak boleh — kalau Owner edit outlet, dia lewat backoffice → webhook → sync.
 */
export const outlets = sqliteTable("outlet", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brandName: text("brand_name"),
  /** Tagline kecil di bawah brand. Sync dari backoffice. */
  brandSubtitle: text("brand_subtitle"),
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  openingHours: text("opening_hours"),
  /** JSON array of strings — line-by-line receipt footer. */
  receiptFooter: text("receipt_footer"),
  /** NPWP — di-render di struk kalau outlet PKP. */
  taxId: text("tax_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  syncedAt: integer("synced_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const stations = sqliteTable("station", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

export const categories = sqliteTable("category", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
});

export const products = sqliteTable("product", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "restrict" }),
  imageEmoji: text("image_emoji"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // HPP cache — di-sync dari backoffice (`menu.hpp_cached`). Dipakai sebagai
  // `hpp_snapshot` saat POS push transaksi ke backoffice supaya laporan
  // profit akurat. Default 0 untuk mode standalone yang tidak track HPP.
  hppCached: integer("hpp_cached").notNull().default(0),
});

/**
 * Printers cache — di-sync dari backoffice GET /api/printers (per outlet).
 *
 * Source of truth tetap backoffice: owner CRUD lewat backoffice → webhook →
 * POS pull ulang. POS hanya read.
 *
 * Cara pakai di POS:
 *  - `/settings` page list semua printer aktif outlet ini, kasir pilih
 *    maks. 2 untuk routing (1 receipt + 1 kitchen). Pilihan disimpan
 *    di localStorage karena per-device (1 outlet bisa pakai 2 device POS
 *    berbeda yang masing-masing tersambung ke 2 hardware printer berbeda).
 *  - Saat receipt page tekan "Cetak", browser `window.print()` dijalankan
 *    sambil meta info `code` printer ditampilkan supaya kasir tau struk
 *    keluar di mana.
 */
export const printers = sqliteTable(
  "printer",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["cashier", "kitchen", "bar", "label"] }).notNull().default("cashier"),
    connection: text("connection", { enum: ["usb", "bluetooth", "network", "other"] }).notNull().default("usb"),
    address: text("address"),
    paperWidth: integer("paper_width").notNull().default(32),
    note: text("note"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    syncedAt: integer("synced_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    byOutlet: index("printer_outlet_idx").on(t.outletId),
  }),
);

export const tables = sqliteTable("restaurant_table", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  label: text("label"),
  status: text("status", { enum: ["empty", "occupied", "dirty"] }).notNull().default("empty"),
  orderId: text("order_id"),
});

/* ---------- Transactional ---------- */

export const shifts = sqliteTable(
  "shift",
  {
    id: text("id").primaryKey(),
    cashierId: text("cashier_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    cashierName: text("cashier_name").notNull(),
    openingCash: integer("opening_cash").notNull(),
    actualCash: integer("actual_cash"),
    note: text("note"),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
  },
  (t) => ({
    byCashier: index("shift_cashier_idx").on(t.cashierId),
    byClosed: index("shift_closed_idx").on(t.closedAt),
  })
);

export const orders = sqliteTable(
  "order",
  {
    id: text("id").primaryKey(),
    shiftId: text("shift_id").notNull().references(() => shifts.id, { onDelete: "restrict" }),
    cashierId: text("cashier_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    cashierName: text("cashier_name").notNull(),
    orderType: text("order_type", { enum: ["dine-in", "takeaway", "delivery"] }).notNull(),
    tableNumber: text("table_number"),
    customerName: text("customer_name"),
    deliveryProvider: text("delivery_provider"),
    isOpenBill: integer("is_open_bill", { mode: "boolean" }).notNull().default(false),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    tax: integer("tax").notNull(),
    service: integer("service").notNull(),
    total: integer("total").notNull(),
    status: text("status", { enum: ["draft", "open", "paid", "void"] }).notNull().default("open"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    paidAt: text("paid_at"),
  },
  (t) => ({
    byShift: index("order_shift_idx").on(t.shiftId),
    byStatus: index("order_status_idx").on(t.status),
  })
);

export const orderItems = sqliteTable(
  "order_item",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    qty: integer("qty").notNull(),
    note: text("note"),
    stationId: text("station_id").notNull().references(() => stations.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["pending", "ongoing", "serve", "done"] }).notNull().default("pending"),
    // Per-item void: bahan tetap kepakai (tidak rollback stock), tapi nilai item
    // dikeluarkan dari subtotal/tax/service/total order — sehingga juga tidak
    // masuk revenue & profit di shift summary / history.
    voidedAt: text("voided_at"),
    voidedBy: text("voided_by"),
    voidedByName: text("voided_by_name"),
    voidReason: text("void_reason"),
  },
  (t) => ({
    byOrder: index("order_item_order_idx").on(t.orderId),
    byStation: index("order_item_station_idx").on(t.stationId, t.status),
    // Untuk audit void & laporan backoffice (mis. "void per hari", "void per kasir").
    byVoided: index("order_item_voided_idx").on(t.voidedAt),
  })
);

export const orderPayments = sqliteTable("order_payment", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }).unique(),
  method: text("method", { enum: ["cash", "qris", "card", "transfer"] }).notNull(),
  amount: integer("amount").notNull(),
  tendered: integer("tendered"),
  change: integer("change"),
  paidAt: text("paid_at").notNull(),
});

/* ---------- Relations ---------- */

export const shiftsRelations = relations(shifts, ({ many, one }) => ({
  cashier: one(users, { fields: [shifts.cashierId], references: [users.id] }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  shift: one(shifts, { fields: [orders.shiftId], references: [shifts.id] }),
  cashier: one(users, { fields: [orders.cashierId], references: [users.id] }),
  items: many(orderItems),
  payment: one(orderPayments, { fields: [orders.id], references: [orderPayments.orderId] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  station: one(stations, { fields: [orderItems.stationId], references: [stations.id] }),
}));

export const orderPaymentsRelations = relations(orderPayments, ({ one }) => ({
  order: one(orders, { fields: [orderPayments.orderId], references: [orders.id] }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  station: one(stations, { fields: [products.stationId], references: [stations.id] }),
}));
