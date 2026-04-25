/**
 * Write-side wrappers untuk mendorong transaksi & void POS ke backoffice.
 *
 * Best-effort, non-blocking dari sudut pandang user:
 *  - POS local DB tetap source of truth dalam shift berjalan (kasir tidak
 *    boleh stuck karena backoffice down).
 *  - Push backoffice idempotent — POS-generated `id` jadi key. Re-push aman.
 *  - Helper di sini di-pakai dari API route handler. Caller-lah yang memutuskan
 *    apakah error di-bubble (mis. saat manual sync) atau di-log (background).
 */

import { backofficeFetch } from "./client";
import { isBackofficeModeEnabled } from "./config";
import { posOrderTypeToBackoffice } from "./mappers";
import type {
  BackofficeCreateTransactionInput,
  BackofficeCreateTransactionItem,
  BackofficeTransaction,
  BackofficeTransactionStatus,
  BackofficeVoidItemResponse,
  BackofficeVoidTransactionResponse,
} from "@/lib/types/backoffice";
import type { OrderType, PaymentMethod } from "@/lib/types";

interface PushTransactionItem {
  /** ID produk POS = `menu_id` backoffice (lihat sync.ts). */
  productId: string;
  productName: string;
  unitPrice: number;
  /**
   * HPP snapshot. Backoffice tidak hitung ulang — kalau 0, profit di laporan
   * jadi = revenue. Sumber: `product.hppCached` (di-sync dari backoffice).
   */
  hppSnapshot: number;
  qty: number;
  /** subtotal = unitPrice * qty (POS belum punya addon). Server cross-check ±1 IDR. */
  subtotal: number;
}

export interface PushTransactionInput {
  /** ID transaksi POS — jadi idempotency key di backoffice. */
  id: string;
  outletId: string;
  paymentMethod: PaymentMethod;
  orderType: OrderType;
  status?: "paid" | "open" | "void";
  subtotal: number;
  discountTotal: number;
  ppnAmount: number;
  serviceChargeAmount: number;
  grandTotal: number;
  createdAt?: string;
  items: PushTransactionItem[];
}

/**
 * POST /api/transactions ke backoffice. Idempotent — re-call dengan id sama
 * tidak menggandakan transaksi.
 *
 * Throw `BackofficeApiError` saat HTTP gagal supaya caller bisa decide
 * (retry queue, log, surface ke user).
 */
export async function pushTransaction(input: PushTransactionInput): Promise<BackofficeTransaction> {
  const body: BackofficeCreateTransactionInput = {
    id: input.id,
    outlet_id: input.outletId,
    payment_method: input.paymentMethod,
    order_type: posOrderTypeToBackoffice(input.orderType),
    status: input.status as BackofficeTransactionStatus | undefined,
    subtotal: input.subtotal,
    discount_total: input.discountTotal,
    ppn_amount: input.ppnAmount,
    service_charge_amount: input.serviceChargeAmount,
    grand_total: input.grandTotal,
    created_at: input.createdAt,
    items: input.items.map<BackofficeCreateTransactionItem>((it) => ({
      menu_id: it.productId,
      bundle_id: null,
      name_snapshot: it.productName,
      quantity: it.qty,
      unit_price: it.unitPrice,
      hpp_snapshot: it.hppSnapshot,
      subtotal: it.subtotal,
      addons: [], // POS belum support addon di MVP
    })),
  };

  return backofficeFetch<BackofficeTransaction>("/api/transactions", {
    method: "POST",
    json: body,
  });
}

/**
 * Void satu item di backoffice. Di-call setelah POS sukses void lokal.
 * `transactionId` = order.id POS (= tx.id backoffice via push).
 * `itemId` = order_item.id POS — POS push items dengan id POS lewat ... eh, tapi
 *
 * **BIG GOTCHA:** kontrak `POST /api/transactions` tidak menerima item.id —
 * server backoffice generate sendiri (`ti_*`). Jadi `order_item.id` POS ≠
 * `transaction_item.id` backoffice. Untuk void, POS harus:
 *   1) Fetch transaction dari backoffice (GET /api/transactions/:id) untuk
 *      mendapatkan mapping item POS → item backoffice via match (menu_id +
 *      name_snapshot + qty), ATAU
 *   2) Pakai endpoint void shortcut `/api/transactions/:id/void` (void semua
 *      item) — tidak ideal karena POS support void per item.
 *
 * Untuk MVP integrasi, kita pilih (1) tapi simplify: cocokkan posisi index
 * (item ke-N di POS = item ke-N di backoffice — server insert urut sesuai
 * payload). Ini valid selama POS tidak reorder items setelah push.
 */
export async function pushVoidItem(opts: {
  transactionId: string;
  /** Index item POS di payload original (0-based). */
  itemIndex: number;
  /** Sebagai cross-check: nama item yang di-void. */
  expectedItemName: string;
  reason: string;
}): Promise<BackofficeVoidItemResponse> {
  // Fetch transaction backoffice untuk dapat list item id-nya.
  const tx = await backofficeFetch<BackofficeTransaction>(
    `/api/transactions/${encodeURIComponent(opts.transactionId)}`
  );
  const target = tx.items[opts.itemIndex];
  if (!target) {
    throw new Error(
      `Item index ${opts.itemIndex} tidak ada di transaksi backoffice (length=${tx.items.length})`
    );
  }
  // Defensive sanity check — kalau urutan beda, jangan asal void item lain.
  if (target.name_snapshot !== opts.expectedItemName) {
    throw new Error(
      `Item mismatch saat void: expected "${opts.expectedItemName}", got "${target.name_snapshot}". ` +
        `Backoffice mungkin reorder items — perlu mapping eksplisit.`
    );
  }

  return backofficeFetch<BackofficeVoidItemResponse>(
    `/api/transactions/${encodeURIComponent(opts.transactionId)}/items/${encodeURIComponent(target.id)}/void`,
    {
      method: "POST",
      json: { reason: opts.reason },
    }
  );
}

/**
 * Void seluruh transaksi (shortcut). Idempotent secara natural — skip
 * item yang sudah voided.
 */
export async function pushVoidTransaction(opts: {
  transactionId: string;
  reason: string;
}): Promise<BackofficeVoidTransactionResponse> {
  return backofficeFetch<BackofficeVoidTransactionResponse>(
    `/api/transactions/${encodeURIComponent(opts.transactionId)}/void`,
    {
      method: "POST",
      json: { reason: opts.reason },
    }
  );
}

/**
 * Wrapper "best-effort": panggil pusher, tangkap error, return null + log.
 * Caller pakai ini saat tidak mau ng-block POS happy path kalau backoffice
 * sebentar down (mis. push transaksi setelah pay sudah commit di local DB).
 */
export async function pushTransactionBestEffort(
  input: PushTransactionInput
): Promise<BackofficeTransaction | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushTransaction(input);
  } catch (e) {
    console.warn("[backoffice] pushTransaction gagal (best-effort):", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function pushVoidItemBestEffort(opts: Parameters<typeof pushVoidItem>[0]): Promise<BackofficeVoidItemResponse | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushVoidItem(opts);
  } catch (e) {
    console.warn("[backoffice] pushVoidItem gagal (best-effort):", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function pushVoidTransactionBestEffort(opts: Parameters<typeof pushVoidTransaction>[0]): Promise<BackofficeVoidTransactionResponse | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushVoidTransaction(opts);
  } catch (e) {
    console.warn("[backoffice] pushVoidTransaction gagal (best-effort):", e instanceof Error ? e.message : e);
    return null;
  }
}
