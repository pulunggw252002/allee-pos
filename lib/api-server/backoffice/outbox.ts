/**
 * Sync outbox helpers — record-keeping untuk push backoffice yang gagal.
 *
 * Kenapa perlu:
 *  - `pushTransactionBestEffort` etc. swallow error & log console. Kalau
 *    backoffice down saat kasir bayar, transaksi orphan di POS DB selamanya.
 *  - Sebelumnya tidak ada audit trail; admin tidak tahu transaksi mana yang
 *    pernah gagal sync. Reports backoffice diam-diam tidak punya data lengkap.
 *
 * Sekarang:
 *  - Setiap push gagal → row baru di `sync_outbox` (atau update row existing
 *    untuk ref_id+kind sama).
 *  - `drainSyncOutbox()` re-try semua item — dipanggil:
 *      a) Manual via `POST /api/sync/retry` (UI banner click).
 *      b) Auto saat sync catalog `/api/backoffice/sync` mau dijalankan.
 *
 * Idempotency:
 *  - Backoffice POST /api/transactions idempotent by `id`.
 *  - Backoffice void item idempotent karena tuple-match skip yang sudah voided.
 *  - Backoffice void transaction idempotent (skip kalau status sudah void).
 *  - Backoffice POST /api/internal/pos-shifts idempotent by shift id.
 *  → Re-push aman.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/api-server/ids";
import {
  pushTransaction,
  pushVoidItem,
  pushVoidTransaction,
  pushShiftSummary,
  type PushTransactionInput,
  type PushVoidItemInput,
  type PushShiftSummaryInput,
} from "./writes";

export type OutboxKind =
  | "transaction"
  | "void_item"
  | "void_transaction"
  | "shift_summary";

interface VoidTransactionPayload {
  transactionId: string;
  reason: string;
}

type OutboxPayload =
  | { kind: "transaction"; payload: PushTransactionInput }
  | { kind: "void_item"; payload: PushVoidItemInput }
  | { kind: "void_transaction"; payload: VoidTransactionPayload }
  | { kind: "shift_summary"; payload: PushShiftSummaryInput };

/**
 * Tulis (atau update) entry outbox untuk satu push gagal.
 *
 * Kalau row dengan (kind, ref_id) sama sudah ada, kita overwrite payload &
 * naikkan attempt count — biar nggak bertumpuk untuk satu transaksi yang
 * di-retry user manual N kali.
 */
export async function enqueueOutbox(
  entry: OutboxPayload,
  refId: string,
  error: unknown,
): Promise<void> {
  const errMsg = error instanceof Error ? error.message : String(error ?? "unknown");
  const existing = await db.query.syncOutbox.findFirst({
    where: and(
      eq(schema.syncOutbox.kind, entry.kind),
      eq(schema.syncOutbox.refId, refId),
    ),
  });
  if (existing) {
    await db
      .update(schema.syncOutbox)
      .set({
        payload: JSON.stringify(entry.payload),
        attempts: existing.attempts + 1,
        lastError: errMsg.slice(0, 500),
        lastTriedAt: new Date(),
      })
      .where(eq(schema.syncOutbox.id, existing.id));
  } else {
    await db.insert(schema.syncOutbox).values({
      id: newId("ob"),
      kind: entry.kind,
      refId,
      payload: JSON.stringify(entry.payload),
      attempts: 1,
      lastError: errMsg.slice(0, 500),
      lastTriedAt: new Date(),
      createdAt: new Date(),
    });
  }
}

export interface DrainResult {
  total: number;
  success: number;
  failed: number;
  remaining: number;
  errors: Array<{ id: string; kind: OutboxKind; refId: string; error: string }>;
}

/**
 * Drain semua entry di outbox. Untuk tiap entry:
 *  - Sukses → DELETE row (transaksi backoffice sudah ke-record).
 *  - Gagal  → naikkan attempts, simpan lastError. Tidak DELETE; akan di-retry
 *    lagi di drain berikutnya (atau manual oleh user).
 *
 * Tidak throw — return summary report. Caller ekspos ke UI agar admin tahu.
 */
export async function drainSyncOutbox(): Promise<DrainResult> {
  const rows = await db.query.syncOutbox.findMany({
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
  const result: DrainResult = {
    total: rows.length,
    success: 0,
    failed: 0,
    remaining: 0,
    errors: [],
  };
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);
      switch (row.kind) {
        case "transaction":
          await pushTransaction(payload as PushTransactionInput);
          break;
        case "void_item":
          await pushVoidItem(payload as PushVoidItemInput);
          break;
        case "void_transaction": {
          const p = payload as VoidTransactionPayload;
          await pushVoidTransaction({ transactionId: p.transactionId, reason: p.reason });
          break;
        }
        case "shift_summary":
          await pushShiftSummary(payload as PushShiftSummaryInput);
          break;
        default:
          throw new Error(`Unknown outbox kind: ${row.kind}`);
      }
      // Sukses — hapus row.
      await db.delete(schema.syncOutbox).where(eq(schema.syncOutbox.id, row.id));
      result.success += 1;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await db
        .update(schema.syncOutbox)
        .set({
          attempts: row.attempts + 1,
          lastError: errMsg.slice(0, 500),
          lastTriedAt: new Date(),
        })
        .where(eq(schema.syncOutbox.id, row.id));
      result.failed += 1;
      result.errors.push({
        id: row.id,
        kind: row.kind as OutboxKind,
        refId: row.refId,
        error: errMsg,
      });
    }
  }
  result.remaining = result.total - result.success;
  return result;
}

export interface OutboxStatus {
  pending: number;
  byKind: Record<OutboxKind, number>;
  oldestCreatedAt: string | null;
}

export async function getOutboxStatus(): Promise<OutboxStatus> {
  const rows = await db.query.syncOutbox.findMany();
  const byKind: Record<OutboxKind, number> = {
    transaction: 0,
    void_item: 0,
    void_transaction: 0,
    shift_summary: 0,
  };
  let oldest: Date | null = null;
  for (const r of rows) {
    byKind[r.kind as OutboxKind] = (byKind[r.kind as OutboxKind] ?? 0) + 1;
    if (!oldest || r.createdAt < oldest) oldest = r.createdAt;
  }
  return {
    pending: rows.length,
    byKind,
    oldestCreatedAt: oldest ? oldest.toISOString() : null,
  };
}
