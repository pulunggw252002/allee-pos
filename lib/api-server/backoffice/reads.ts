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
  BackofficePrinter,
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

// --- Printers -------------------------------------------------------------

/**
 * Pull printer master data untuk outlet tertentu. Backoffice mendukung
 * filter `?outlet_id=...` jadi kita kirim langsung — efisien dan tidak
 * perlu pull semua outlet lalu filter di POS.
 *
 * Kita hanya pakai printer yang `is_active = true` di POS UI; toggle
 * non-aktif di backoffice langsung memunculkan/menghilangkan dari
 * picker tanpa kasir perlu sync ulang.
 */
export async function fetchPrintersForOutlet(outletId: string): Promise<BackofficePrinter[]> {
  const all = await backofficeFetch<BackofficePrinter[]>(
    `/api/printers?outlet_id=${encodeURIComponent(outletId)}`,
  );
  return all.filter((p) => p.is_active);
}

// --- Users (untuk PIN login UI / shift) -----------------------------------

export async function fetchUsers(): Promise<BackofficeUser[]> {
  return backofficeFetch<BackofficeUser[]>("/api/users");
}

/**
 * Internal endpoint: ambil PIN hash setiap staff (Better Auth scrypt).
 *
 * Auth via shared secret `POS_WEBHOOK_SECRET` — bukan via session backoffice
 * yang kita pakai untuk endpoint biasa. Alasannya:
 *  - Endpoint ini sengaja terpisah dari `/api/users` supaya hash tidak bocor
 *    ke UI/role apapun yang punya akses ke users list.
 *  - POS server-to-server pakai env yang sama dengan webhook receiver.
 *
 * Hash ini dipakai di sync.ts untuk diisi langsung ke `account.password`
 * lokal POS, sehingga PIN login di POS bisa pakai Better Auth signInUsername
 * tanpa POS perlu tahu PIN plain-text.
 */
export interface BackofficePosPin {
  user_id: string;
  name: string;
  role: string;
  outlet_id: string | null;
  pos_pin_hash: string;
}

export async function fetchPosPinsForOutlet(
  outletId: string,
): Promise<BackofficePosPin[]> {
  const cfg = readBackofficeConfig();
  const secret = process.env.POS_WEBHOOK_SECRET;
  if (!secret) {
    // Tanpa shared secret kita tidak bisa pull hash → PIN login pasti gagal
    // untuk synced users. Lemparkan supaya sync caller bisa surface error
    // yang jelas (lebih baik fail-loud ketimbang silent-broken PIN).
    throw new Error(
      "POS_WEBHOOK_SECRET belum di-set di POS — tidak bisa pull PIN hash dari backoffice",
    );
  }
  const url = `${cfg.apiUrl}/api/internal/pos-pins?outlet_id=${encodeURIComponent(outletId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      Origin: cfg.apiUrl,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Pull PIN hash dari backoffice gagal (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as BackofficePosPin[];
}
