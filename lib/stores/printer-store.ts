"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Pilihan printer per-device POS. Owner CRUD daftar printer di backoffice
 * → POS sync ke local DB → kasir pilih maks. 2 dari daftar itu di
 * `/settings`:
 *   - `receiptPrinterId`: untuk struk pembayaran (cetak setelah bayar /
 *     reprint dari open bill).
 *   - `kitchenPrinterId`: untuk tiket dapur saat order dimasukkan.
 *
 * Disimpan di localStorage karena per-device: 1 outlet bisa punya
 * 2 device POS yang masing-masing pasangannya printer fisik berbeda
 * (mis. POS depan → printer kasir + KDS dapur, POS bar → printer kasir
 * bar + printer label).
 *
 * MVP printing: kita pakai `window.print()` ke OS default printer.
 * `code` yang ke-pick di sini di-tampilkan di UI (badge / banner) supaya
 * kasir tahu mau ngasih instruksi setting printer di OS yang sesuai.
 */
interface PrinterState {
  /** ID printer (`prn_*`) untuk struk pembayaran. */
  receiptPrinterId: string | null;
  /** ID printer (`prn_*`) untuk tiket dapur. */
  kitchenPrinterId: string | null;
  setReceiptPrinter: (id: string | null) => void;
  setKitchenPrinter: (id: string | null) => void;
  /** Reset pilihan — dipakai saat staf ganti device atau outlet pindah. */
  reset: () => void;
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      receiptPrinterId: null,
      kitchenPrinterId: null,
      setReceiptPrinter: (id) => set({ receiptPrinterId: id }),
      setKitchenPrinter: (id) => set({ kitchenPrinterId: id }),
      reset: () => set({ receiptPrinterId: null, kitchenPrinterId: null }),
    }),
    { name: "allee:printer-selection" },
  ),
);
