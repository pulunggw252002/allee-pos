/**
 * Runtime config: baca outlet & tax settings dari local DB (hasil sync
 * backoffice). Replacement untuk `pos-config.ts` yang isinya hardcoded —
 * supaya POS bisa multi-tenant / franchise-ready: tiap outlet punya
 * brand/footer/tax sendiri yang di-define di backoffice, bukan di code.
 *
 * Source of truth = backoffice. POS hanya cache. Helper ini selalu prefer
 * data dari local DB; fallback ke env / default _hanya_ ketika backoffice
 * belum pernah di-sync (cold start standalone mode atau first-deploy).
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { resolveOutletId } from "./backoffice/reads";
import { isBackofficeModeEnabled } from "./backoffice/config";

/** Default ketika belum pernah sync (standalone mode pre-integration). */
const DEFAULT_TAX = { taxRate: 0.1, serviceRate: 0.05 };
const DEFAULT_RECEIPT_FOOTER = ["Terima kasih ☕", "Sampai jumpa kembali!"];

const META_KEY_TAX = "backoffice.tax_settings";

export interface OutletConfig {
  /** Stable id outlet — dipakai sebagai outlet_id saat push transaksi ke backoffice. */
  id: string;
  /** Brand name yang muncul di header receipt. */
  brandName: string;
  /** Sub-brand / tagline kecil — optional. */
  subtitle?: string;
  address?: string;
  city?: string;
  phone?: string;
  /** Array string per-line untuk footer receipt. */
  receiptFooter: string[];
}

export interface TaxRates {
  /** Persentase 0..1 (mis. 0.1 = 10%). */
  taxRate: number;
  serviceRate: number;
}

/**
 * Ambil outlet aktif dari local DB. Outlet dipilih berdasarkan
 * `resolveOutletId()` (env override → backoffice session). Kalau outlet
 * belum ke-sync, fallback ke entry minimal pakai env brand kalau ada.
 */
export async function getOutletConfig(): Promise<OutletConfig> {
  // Outlet id resolusinya:
  //  1. NEXT_PUBLIC_OUTLET_ID env (pin POS ini ke outlet tertentu).
  //  2. session backoffice (kalau BACKOFFICE_MODE on).
  //  3. fallback "default" — pakai env brand atau placeholder.
  let outletId = process.env.NEXT_PUBLIC_OUTLET_ID?.trim() || null;
  if (!outletId && isBackofficeModeEnabled()) {
    try {
      outletId = await resolveOutletId();
    } catch {
      outletId = null;
    }
  }

  if (outletId) {
    const row = await db.query.outlets.findFirst({
      where: eq(schema.outlets.id, outletId),
    });
    if (row) {
      return {
        id: row.id,
        brandName: row.brandName ?? row.name,
        subtitle: undefined,
        address: row.address ?? undefined,
        city: row.city ?? undefined,
        phone: row.phone ?? undefined,
        receiptFooter: parseReceiptFooter(row.receiptFooter) ?? envReceiptFooter() ?? DEFAULT_RECEIPT_FOOTER,
      };
    }
  }

  // Fallback: outlet belum sync. Pakai env atau placeholder. NEVER throw —
  // POS harus tetap bisa terbitkan struk walaupun integrasi backoffice down.
  return {
    id: outletId ?? "out_unknown",
    brandName: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "POS",
    subtitle: process.env.NEXT_PUBLIC_BRAND_SUBTITLE?.trim() || undefined,
    address: undefined,
    city: undefined,
    phone: undefined,
    receiptFooter: envReceiptFooter() ?? DEFAULT_RECEIPT_FOOTER,
  };
}

/**
 * Ambil tax/service rate dari `system_meta`. Kalau belum sync, fallback
 * ke default 10% PPN + 5% service. Selalu menormalkan ke 0..1 (backoffice
 * simpan dalam persen, mis. 10 → 0.1).
 */
export async function getTaxRates(): Promise<TaxRates> {
  const row = await db.query.systemMeta.findFirst({
    where: eq(schema.systemMeta.key, META_KEY_TAX),
  });
  if (!row) return DEFAULT_TAX;
  try {
    const parsed = JSON.parse(row.value) as {
      ppn_percent?: number;
      service_charge_percent?: number;
    };
    const taxRate = normalizePercent(parsed.ppn_percent, DEFAULT_TAX.taxRate);
    const serviceRate = normalizePercent(parsed.service_charge_percent, DEFAULT_TAX.serviceRate);
    return { taxRate, serviceRate };
  } catch {
    return DEFAULT_TAX;
  }
}

/**
 * Backoffice menyimpan persentase dalam dua format yang sah:
 *  - 10 → 10%
 *  - 0.1 → 10%
 * Kita normalisasi ke 0..1. Kalau angka > 1, asumsikan persen.
 */
function normalizePercent(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return fallback;
  return v > 1 ? v / 100 : v;
}

function parseReceiptFooter(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed;
    }
  } catch {
    // raw bukan JSON → split per newline.
  }
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

function envReceiptFooter(): string[] | null {
  const raw = process.env.NEXT_PUBLIC_RECEIPT_FOOTER?.trim();
  if (!raw) return null;
  return raw.split("|").map((s) => s.trim()).filter(Boolean);
}
