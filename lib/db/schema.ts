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

/* ---------- Catalog (pushed down from backoffice) ---------- */

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
