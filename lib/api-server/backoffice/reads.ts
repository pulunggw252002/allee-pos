/**
 * Read-side wrappers untuk endpoint master data backoffice.
 *
 * Setiap fungsi men-shape ulang response sesuai apa yang POS perlu — sebagian
 * cuma forward, sebagian filter outlet. Penamaan sengaja paralel dengan
 * `lib/api/products.ts` / `categories.ts` lokal supaya gampang ditelusuri.
 *
 * Lihat `Backoffice ALLEE/docs/pos-api-contract.md` §3 untuk shape lengkap.
 */

import { backofficeFetch } from "./client";
import { readBackofficeConfig } from "./config";
import type {
  BackofficeAddonGroup,
  BackofficeBundle,
  BackofficeCategory,
  BackofficeDiscount,
  BackofficeIngredient,
  BackofficeMenu,
  BackofficeOutlet,
  BackofficeSession,
  BackofficeTaxSettings,
  BackofficeUser,
} from "@/lib/types/backoffice";

// --- Identity / RBAC ------------------------------------------------------

export async function fetchSession(): Promise<BackofficeSession> {
  return backofficeFetch<BackofficeSession>("/api/session");
}

/**
 * Tentukan outlet aktif POS. Urutan resolusi:
 *   1. NEXT_PUBLIC_OUTLET_ID env (override eksplisit, untuk MVP 1-cabang).
 *   2. /api/session.outlet_id (auto-detect dari user yang sign-in).
 */
export async function resolveOutletId(): Promise<string> {
  const cfg = readBackofficeConfig();
  if (cfg.outletIdOverride) return cfg.outletIdOverride;
  const session = await fetchSession();
  return session.outlet_id;
}

// --- Outlets / Catalog ----------------------------------------------------

export async function fetchOutlets(): Promise<BackofficeOutlet[]> {
  return backofficeFetch<BackofficeOutlet[]>("/api/outlets");
}

export async function fetchCategories(): Promise<BackofficeCategory[]> {
  return backofficeFetch<BackofficeCategory[]>("/api/categories");
}

export async function fetchMenus(): Promise<BackofficeMenu[]> {
  return backofficeFetch<BackofficeMenu[]>("/api/menus");
}

/**
 * Menus yang available di outlet tertentu + active. Filter dilakukan di
 * client untuk konsistensi dengan §3.2 contract — backoffice belum punya
 * filter query string per outlet.
 */
export async function fetchMenusForOutlet(outletId: string): Promise<BackofficeMenu[]> {
  const all = await fetchMenus();
  return all.filter(
    (m) => m.is_active && (m.outlet_ids.length === 0 || m.outlet_ids.includes(outletId))
  );
}

export async function fetchMenuById(id: string): Promise<BackofficeMenu> {
  return backofficeFetch<BackofficeMenu>(`/api/menus/${encodeURIComponent(id)}`);
}

export async function fetchAddonGroups(): Promise<BackofficeAddonGroup[]> {
  return backofficeFetch<BackofficeAddonGroup[]>("/api/addon-groups");
}

export async function fetchBundles(): Promise<BackofficeBundle[]> {
  return backofficeFetch<BackofficeBundle[]>("/api/bundles");
}

export async function fetchBundlesForOutlet(outletId: string): Promise<BackofficeBundle[]> {
  const all = await fetchBundles();
  return all.filter(
    (b) => b.is_active && (b.outlet_ids.length === 0 || b.outlet_ids.includes(outletId))
  );
}

export async function fetchDiscounts(): Promise<BackofficeDiscount[]> {
  return backofficeFetch<BackofficeDiscount[]>("/api/discounts");
}

export async function fetchActiveDiscounts(): Promise<BackofficeDiscount[]> {
  const all = await fetchDiscounts();
  return all.filter((d) => d.is_active);
}

// --- Stock / Tax ----------------------------------------------------------

export async function fetchIngredients(): Promise<BackofficeIngredient[]> {
  return backofficeFetch<BackofficeIngredient[]>("/api/ingredients");
}

export async function fetchTaxSettings(): Promise<BackofficeTaxSettings> {
  return backofficeFetch<BackofficeTaxSettings>("/api/tax-settings");
}

// --- Users (untuk PIN login UI / shift) -----------------------------------

export async function fetchUsers(): Promise<BackofficeUser[]> {
  return backofficeFetch<BackofficeUser[]>("/api/users");
}
