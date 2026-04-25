/**
 * Mappers antara schema Backoffice ALLEE dan schema lokal POS.
 *
 * Asumsi penting:
 *  - POS local schema dibangun MVP-first sebelum backoffice ada. Beberapa
 *    konsep di POS tidak ada di backoffice (Station/KDS routing, Shift,
 *    Table) — itu tetap POS-only.
 *  - Beberapa konsep di backoffice tidak ada di POS (Bundle, Addon, HPP,
 *    Outlet, Stock). Mappers di sini cuma cover field yang shared.
 *
 * Mapping table (ringkas):
 *
 *  Product (POS)             ←   Menu (Backoffice)
 *  ─────────────────────────     ──────────────────────────
 *   id                       =   id (e.g. "mnu_ice_latte")
 *   name                     =   name
 *   price                    =   price
 *   categoryId               =   category_id
 *   stationId                =   ⚠️ POS-local; di-set "st-bar" default,
 *                                owner mapping manual via env (lihat #1)
 *   imageEmoji               =   undefined (backoffice pakai photo_url)
 *   active                   =   is_active
 *
 *  Category (POS)            ←   Category (Backoffice)
 *   id                       =   id
 *   name                     =   name
 *   order                    =   sort_order
 *
 *  OrderType (POS)           ↔   BackofficeOrderType
 *   "dine-in"                =   "dine_in"
 *   "takeaway"               =   "take_away"
 *   "delivery"               =   "delivery"
 *   (POS tidak punya online)
 *
 *  PaymentMethod (POS)       ↔   BackofficePaymentMethod
 *   identical names ("cash" | "qris" | "card" | "transfer").
 *
 * Issues / Roadmap:
 *  #1 — Station mapping: backoffice tidak punya konsep station/KDS routing.
 *       Untuk MVP integrasi, semua menu di-route ke station default
 *       (`DEFAULT_STATION_ID`). Owner harus revisit ini saat KDS dibangun
 *       di backoffice atau saat POS punya UI mapping per kategori.
 */

import type { Category, OrderType, Product } from "@/lib/types";
import type {
  BackofficeCategory,
  BackofficeMenu,
  BackofficeOrderType,
} from "@/lib/types/backoffice";

/**
 * Default station untuk menu dari backoffice. Matches seed POS lokal
 * (`lib/mock/stations.ts`). Kalau di kemudian hari backoffice expose
 * station_id, ganti ke field itu.
 */
export const DEFAULT_STATION_ID = "st-bar";

/**
 * Mapping kategori → station. POS pakai station untuk routing KDS.
 * Heuristic sederhana berbasis nama kategori — bisa di-override via env
 * `BACKOFFICE_STATION_MAP` (format JSON: `{ "cat_food": "st-kitchen" }`).
 */
function categoryToStation(categoryId: string, categoryName?: string): string {
  // Eksplisit env override.
  const raw = process.env.BACKOFFICE_STATION_MAP;
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      if (map[categoryId]) return map[categoryId];
    } catch {
      // Ignore malformed JSON — jangan crash request gara-gara env typo.
    }
  }
  const lower = (categoryName ?? "").toLowerCase();
  if (lower.includes("food") || lower.includes("snack") || lower.includes("makanan")) {
    return "st-kitchen";
  }
  return DEFAULT_STATION_ID;
}

export function backofficeMenuToProduct(
  menu: BackofficeMenu,
  options: { categoryName?: string } = {}
): Product & { hppCached: number } {
  return {
    id: menu.id,
    name: menu.name,
    price: menu.price,
    categoryId: menu.category_id,
    stationId: categoryToStation(menu.category_id, options.categoryName),
    imageEmoji: undefined, // backoffice pakai photo_url; POS UI fall back ke initial
    active: menu.is_active,
    // HPP cached untuk push transaksi ke backoffice (lihat schema.ts).
    hppCached: menu.hpp_cached,
  };
}

export function backofficeCategoryToCategory(c: BackofficeCategory): Category {
  return { id: c.id, name: c.name, order: c.sort_order };
}

// --- OrderType -----------------------------------------------------------

const ORDER_TYPE_TO_BACKOFFICE: Record<OrderType, BackofficeOrderType> = {
  "dine-in": "dine_in",
  takeaway: "take_away",
  delivery: "delivery",
};

const ORDER_TYPE_FROM_BACKOFFICE: Record<BackofficeOrderType, OrderType | null> = {
  dine_in: "dine-in",
  take_away: "takeaway",
  delivery: "delivery",
  online: null, // POS tidak handle "online" — caller harus bypass
};

export function posOrderTypeToBackoffice(t: OrderType): BackofficeOrderType {
  return ORDER_TYPE_TO_BACKOFFICE[t];
}

export function backofficeOrderTypeToPos(t: BackofficeOrderType): OrderType | null {
  return ORDER_TYPE_FROM_BACKOFFICE[t];
}
