import { apiFetch } from "./client";

/**
 * Shape printer yang di-return GET /api/printers (POS internal).
 *
 * Sengaja shape-nya match row local DB (`printer` table) — sudah hasil
 * sync dari backoffice. Field `address` & `connection` informational
 * untuk help kasir tahu printer mana di physical, tidak dipakai code
 * routing (browser-print MVP via OS default printer).
 */
export interface PosPrinter {
  id: string;
  outletId: string;
  code: string;
  name: string;
  type: "cashier" | "kitchen" | "bar" | "label";
  connection: "usb" | "bluetooth" | "network" | "other";
  address: string | null;
  paperWidth: number;
  note: string | null;
  active: boolean;
}

export async function listPrinters(): Promise<PosPrinter[]> {
  return apiFetch<PosPrinter[]>("/api/printers");
}
