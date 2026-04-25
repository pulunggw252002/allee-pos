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
import { isBackofficeModeEnabled, readBackofficeConfig } from "./config";
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
 *
 * Background: kontrak `POST /api/transactions` tidak menerima item.id —
 * server backoffice generate sendiri (`ti_*`). Jadi `order_item.id` POS ≠
 * `transaction_item.id` backoffice. Untuk void per-item kita harus mapping
 * dulu via GET /api/transactions/:id.
 *
 * Strategy mapping (kuat → lemah):
 *   1) Match by (menu_id, name_snapshot, qty, unit_price) — paling kuat.
 *      Backoffice tidak reorder items, jadi tuple ini unique-per-tx.
 *   2) Fallback ke index — kalau di tx ada banyak item identik, kita pakai
 *      index "ke-N kemunculan" dari item match candidate.
 *
 * Index sederhana lama (item ke-N keseluruhan) RENTAN: kalau backoffice
 * suatu hari menambah pre-processing yang menggabung items, urutan bisa
 * shift. Tuple match jauh lebih tahan banting.
 */
export interface PushVoidItemInput {
  transactionId: string;
  /** Identitas item POS yang di-void. */
  posItem: {
    /** product.id POS = menu_id backoffice. */
    productId: string;
    productName: string;
    unitPrice: number;
    qty: number;
  };
  /**
   * Index "ke-N kemunculan" di POS items dengan tuple identik. Untuk
   * tx normal (item-item beda) selalu 0. Hanya relevan kalau ada
   * duplikat tuple (mis. dua "Ice Latte 25k qty 1" di tx yang sama).
   */
  duplicateIndex?: number;
  reason: string;
}

export async function pushVoidItem(
  opts: PushVoidItemInput,
): Promise<BackofficeVoidItemResponse> {
  const tx = await backofficeFetch<BackofficeTransaction>(
    `/api/transactions/${encodeURIComponent(opts.transactionId)}`,
  );

  const candidates = tx.items.filter(
    (it) =>
      it.menu_id === opts.posItem.productId &&
      it.name_snapshot === opts.posItem.productName &&
      it.quantity === opts.posItem.qty &&
      it.unit_price === opts.posItem.unitPrice &&
      !it.voided_at, // skip yang sudah voided
  );

  if (candidates.length === 0) {
    throw new Error(
      `Item "${opts.posItem.productName}" (menu_id=${opts.posItem.productId}, qty=${opts.posItem.qty}) ` +
        `tidak ditemukan di transaksi backoffice — kemungkinan tx ini belum ke-push, atau item sudah voided.`,
    );
  }

  const dup = opts.duplicateIndex ?? 0;
  const target = candidates[dup];
  if (!target) {
    throw new Error(
      `Duplicate index ${dup} di luar jangkauan (cuma ada ${candidates.length} match).`,
    );
  }

  return backofficeFetch<BackofficeVoidItemResponse>(
    `/api/transactions/${encodeURIComponent(opts.transactionId)}/items/${encodeURIComponent(target.id)}/void`,
    {
      method: "POST",
      json: { reason: opts.reason },
    },
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
 *
 * Update penting: kalau gagal, kita TIDAK silent — masuk ke `sync_outbox`
 * supaya bisa di-retry nanti (manual via UI banner atau auto via
 * `drainSyncOutbox()`). Ini menutup gap "transaksi paid di POS tapi tidak
 * pernah masuk laporan backoffice karena network down sebentar".
 *
 * NOTE: import outbox di-lazy supaya cycle import (writes ↔ outbox) aman:
 * outbox.ts import push fns dari sini, dan kita import enqueue dari sana.
 */
export async function pushTransactionBestEffort(
  input: PushTransactionInput
): Promise<BackofficeTransaction | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushTransaction(input);
  } catch (e) {
    console.warn("[backoffice] pushTransaction gagal (best-effort):", e instanceof Error ? e.message : e);
    try {
      const { enqueueOutbox } = await import("./outbox");
      await enqueueOutbox({ kind: "transaction", payload: input }, input.id, e);
    } catch (enqueueErr) {
      console.error("[backoffice] gagal enqueue ke outbox:", enqueueErr);
    }
    return null;
  }
}

export async function pushVoidItemBestEffort(opts: Parameters<typeof pushVoidItem>[0]): Promise<BackofficeVoidItemResponse | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushVoidItem(opts);
  } catch (e) {
    console.warn("[backoffice] pushVoidItem gagal (best-effort):", e instanceof Error ? e.message : e);
    try {
      const { enqueueOutbox } = await import("./outbox");
      // Composite ref id biar push transaksi & void item-nya entry beda.
      const refId = `${opts.transactionId}#${opts.posItem.productId}-${opts.posItem.qty}-${opts.duplicateIndex ?? 0}`;
      await enqueueOutbox({ kind: "void_item", payload: opts }, refId, e);
    } catch (enqueueErr) {
      console.error("[backoffice] gagal enqueue ke outbox:", enqueueErr);
    }
    return null;
  }
}

export async function pushVoidTransactionBestEffort(opts: Parameters<typeof pushVoidTransaction>[0]): Promise<BackofficeVoidTransactionResponse | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushVoidTransaction(opts);
  } catch (e) {
    console.warn("[backoffice] pushVoidTransaction gagal (best-effort):", e instanceof Error ? e.message : e);
    try {
      const { enqueueOutbox } = await import("./outbox");
      await enqueueOutbox(
        { kind: "void_transaction", payload: { transactionId: opts.transactionId, reason: opts.reason } },
        opts.transactionId,
        e,
      );
    } catch (enqueueErr) {
      console.error("[backoffice] gagal enqueue ke outbox:", enqueueErr);
    }
    return null;
  }
}

// --- Shift summary push ---------------------------------------------------

/**
 * Payload untuk POST /api/internal/pos-shifts di backoffice.
 *
 * Auth-nya pakai bearer `POS_WEBHOOK_SECRET` (bukan session backoffice),
 * sama mekanisme dengan endpoint internal pos-pins. Alasannya: shift close
 * di-trigger dari POS server sendiri (bukan via UI yang punya session
 * backoffice), jadi kita pakai shared secret server-to-server.
 */
export interface PushShiftSummaryInput {
  /** PK = id shift POS — idempotency key. */
  id: string;
  outletId: string;
  cashierUserId: string;
  cashierName: string;
  openingCash: number;
  actualCash: number;
  expectedCash: number;
  cashDifference: number;
  totalRevenue: number;
  orderCount: number;
  /** { cash, qris, card, transfer } in IDR. */
  breakdown: Record<string, number>;
  note?: string | null;
  openedAt: string;
  closedAt: string;
}

export interface PushShiftSummaryResponse {
  ok: true;
  id: string;
  synced_at: string;
}

export async function pushShiftSummary(
  input: PushShiftSummaryInput,
): Promise<PushShiftSummaryResponse> {
  const cfg = readBackofficeConfig();
  const secret = process.env.POS_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "POS_WEBHOOK_SECRET belum di-set di POS — tidak bisa push shift summary",
    );
  }
  const url = `${cfg.apiUrl}/api/internal/pos-shifts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      Origin: cfg.apiUrl,
    },
    body: JSON.stringify({
      id: input.id,
      outlet_id: input.outletId,
      cashier_user_id: input.cashierUserId,
      cashier_name: input.cashierName,
      opening_cash: input.openingCash,
      actual_cash: input.actualCash,
      expected_cash: input.expectedCash,
      cash_difference: input.cashDifference,
      total_revenue: input.totalRevenue,
      order_count: input.orderCount,
      breakdown: input.breakdown,
      note: input.note ?? null,
      opened_at: input.openedAt,
      closed_at: input.closedAt,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Push shift summary ke backoffice gagal (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as PushShiftSummaryResponse;
}

export async function pushShiftSummaryBestEffort(
  input: PushShiftSummaryInput,
): Promise<PushShiftSummaryResponse | null> {
  if (!isBackofficeModeEnabled()) return null;
  try {
    return await pushShiftSummary(input);
  } catch (e) {
    console.warn(
      "[backoffice] pushShiftSummary gagal (best-effort):",
      e instanceof Error ? e.message : e,
    );
    try {
      const { enqueueOutbox } = await import("./outbox");
      await enqueueOutbox({ kind: "shift_summary", payload: input }, input.id, e);
    } catch (enqueueErr) {
      console.error("[backoffice] gagal enqueue shift summary ke outbox:", enqueueErr);
    }
    return null;
  }
}
