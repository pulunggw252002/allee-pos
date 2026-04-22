/**
 * Central POS configuration.
 *
 * Semua nilai "outlet-specific" atau yang nantinya diatur dari Back Office
 * hidup di file ini, jangan di-hardcode di komponen/pages.
 *
 * SAAT BACKEND SIAP: ganti `DEFAULT_POS_CONFIG` dengan hasil
 * `await fetch("/api/pos/config")` di `loadPosConfig()`. Bentuk payload
 * backend WAJIB cocok dengan tipe `PosConfig` di bawah ini — itulah
 * kontrak yang perlu dijaga saat swap.
 */

import type { Cashier, PaymentMethod } from "@/lib/types";
import { apiFetch } from "./client";

export interface OutletConfig {
  brandName: string;
  subtitle: string;
  receiptFooter: string[];
  /** Desimal. 0.1 = 10%. */
  taxRate: number;
  /** Desimal. 0.05 = 5%. */
  serviceRate: number;
}

export interface PosConfig {
  outlet: OutletConfig;
  /** Daftar default yang ditawarkan di UI. Kasir boleh ketik custom. */
  deliveryProviders: readonly string[];
  /** Preset tombol diskon cepat (IDR). */
  discountPresets: readonly number[];
  /** Denominasi langsung untuk numpad pembayaran tunai. */
  cashDenominations: readonly number[];
  /** Step pembulatan ke atas untuk saran nominal bayar. */
  cashSuggestionSteps: readonly number[];
  /** Preset kas awal shift (IDR). */
  openingCashPresets: readonly number[];
  /** Metode pembayaran yang aktif di outlet ini. */
  enabledPaymentMethods: readonly PaymentMethod[];
  /** Role yang boleh menandai item sebagai "done" di station tracking. */
  itemDoneRoles: readonly Cashier["role"][];
}

const DEFAULT_POS_CONFIG: PosConfig = {
  outlet: {
    brandName: "ALLEE SOCIAL HOUSE",
    subtitle: "Coffee & Kitchen",
    receiptFooter: ["Terima kasih ☕", "Sampai jumpa kembali!"],
    taxRate: 0.1,
    serviceRate: 0.05,
  },
  deliveryProviders: ["Grab", "Gojek", "ShopeeFood", "Joker", "Traveloka Eats"],
  discountPresets: [0, 5_000, 10_000, 20_000],
  cashDenominations: [10_000, 20_000, 50_000, 100_000],
  cashSuggestionSteps: [5_000, 10_000, 20_000, 50_000, 100_000],
  openingCashPresets: [100_000, 200_000, 300_000, 500_000, 1_000_000],
  enabledPaymentMethods: ["cash", "qris", "card", "transfer"],
  itemDoneRoles: ["cashier", "supervisor"],
};

let cached: PosConfig = DEFAULT_POS_CONFIG;

/**
 * Sync accessor — dipakai di komponen yang tidak butuh await.
 * Aman karena default config selalu tersedia; kalau backend sudah dimuat,
 * akan mengembalikan nilai dari cache.
 */
export function getPosConfig(): PosConfig {
  return cached;
}

/**
 * Async loader — panggil sekali saat app boot untuk mengisi cache dari backend.
 * TODO: ganti body dengan `await fetch("/api/pos/config").then(r => r.json())`.
 */
export async function loadPosConfig(): Promise<PosConfig> {
  try {
    cached = await apiFetch<PosConfig>("/api/pos/config");
  } catch (err) {
    console.warn("[pos-config] gagal load dari server, pakai default", err);
    cached = DEFAULT_POS_CONFIG;
  }
  return cached;
}

export function setPosConfigForTesting(partial: Partial<PosConfig>): void {
  cached = { ...cached, ...partial };
}
