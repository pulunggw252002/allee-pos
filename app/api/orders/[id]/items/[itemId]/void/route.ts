import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { getTaxRates } from "@/lib/api-server/runtime-config";
import { mapFullOrder } from "@/lib/api-server/order-mapper";
import { isBackofficeModeEnabled } from "@/lib/api-server/backoffice/config";
import { pushVoidItemBestEffort } from "@/lib/api-server/backoffice/writes";

const bodySchema = z.object({
  reason: z.string().trim().min(1, "Alasan void wajib diisi").max(200),
});

/**
 * Void per item.
 *
 * Aturan bisnis:
 * - Tidak bisa void item dari order yang sudah di-void seluruhnya.
 * - Tidak bisa void item yang sudah di-void.
 * - Tidak bisa void item terakhir yang masih aktif (lebih tepat pakai
 *   void seluruh order — DELETE /api/orders/:id), kecuali order sudah paid
 *   (untuk paid order tidak bisa void seluruhnya, jadi item-by-item OK).
 * - Setelah void: subtotal/tax/service/total order dihitung ulang dari
 *   item-item yang masih aktif. Stock/bahan tidak di-rollback (sesuai
 *   permintaan: bahan tetap berkurang).
 * - Item yang di-void juga di-mark `status = "done"` supaya tidak ditarik
 *   oleh KDS / aggregation queries yang memfilter berdasarkan status saja.
 * - Payment record (`amount`/`tendered`/`change`) TIDAK diubah — itu
 *   catatan historis pembayaran. Selisih antara payment.amount dengan
 *   order.total baru = nilai void (untuk dikembalikan ke pelanggan atau
 *   diketahui sebagai selisih kas saat tutup shift).
 *
 * Concurrency:
 * - Read order + recompute total dilakukan DI DALAM transaction supaya
 *   dua void paralel pada item berbeda tidak meng-clobber total satu sama
 *   lain (race condition).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  return handle(async () => {
    const user = await requireSession();
    const { id, itemId } = await ctx.params;
    const { reason } = bodySchema.parse(await req.json());

    const voidedAt = new Date().toISOString();
    // Tax/service rate di-resolve dari runtime config (synced dari backoffice).
    const { taxRate, serviceRate } = await getTaxRates();

    await db.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, id),
        with: { items: true },
      });
      if (!order) throw new ApiError(404, "Order tidak ditemukan");
      if (order.status === "void") {
        throw new ApiError(409, "Order sudah di-void seluruhnya");
      }
      if (order.status === "draft") {
        throw new ApiError(
          400,
          "Order masih draft — tambahkan ke order dulu sebelum void."
        );
      }

      const target = order.items.find((it) => it.id === itemId);
      if (!target) throw new ApiError(404, "Item tidak ditemukan dalam order ini");
      if (target.voidedAt) throw new ApiError(409, "Item sudah di-void");

      // Cegah void semua item — minta user pakai void order saja.
      const remainingActive = order.items.filter(
        (it) => it.id !== itemId && !it.voidedAt
      );
      if (remainingActive.length === 0 && order.status !== "paid") {
        throw new ApiError(
          400,
          "Tidak bisa void item terakhir. Gunakan void seluruh order."
        );
      }

      // Hitung ulang total dari sisa item aktif.
      const newSubtotal = remainingActive.reduce(
        (s, it) => s + it.unitPrice * it.qty,
        0
      );
      const discount = order.discount;
      const afterDiscount = Math.max(0, newSubtotal - discount);
      const newTax = Math.round(afterDiscount * taxRate);
      const newService = Math.round(afterDiscount * serviceRate);
      const newTotal = afterDiscount + newTax + newService;

      // Kunci optimistik: hanya update item yang masih aktif (voidedAt IS NULL).
      // Status di-set "done" agar KDS / aggregations tidak menariknya lagi
      // walaupun lupa filter `voidedAt IS NULL`.
      await tx
        .update(schema.orderItems)
        .set({
          voidedAt,
          voidedBy: user.id,
          voidedByName: user.name,
          voidReason: reason,
          status: "done",
        })
        .where(
          and(
            eq(schema.orderItems.id, itemId),
            isNull(schema.orderItems.voidedAt)
          )
        );

      await tx
        .update(schema.orders)
        .set({
          subtotal: newSubtotal,
          tax: newTax,
          service: newService,
          total: newTotal,
        })
        .where(eq(schema.orders.id, id));
    });

    const fresh = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true, payment: true },
    });
    if (!fresh) throw new ApiError(500, "Gagal mengambil order setelah void");

    // --- Best-effort push void ke backoffice ------------------------------
    // Identifikasi item via tuple (menu_id, name, qty, unit_price) — bukan
    // index. Tuple match tahan banting walau backoffice reorder items.
    //
    // duplicateIndex: kalau di tx POS ada banyak item dengan tuple identik
    // (mis. dua "Ice Latte 25k qty 1"), kita pakai posisi ke-N. Hitung
    // dengan filter items POS dengan tuple yang sama, lalu temukan index
    // item target di list itu.
    let syncStatus: "ok" | "failed" | "skipped" = "skipped";
    let syncError: string | null = null;
    if (isBackofficeModeEnabled() && fresh.status === "paid") {
      try {
        const target = fresh.items.find((it) => it.id === itemId);
        if (target) {
          const sameTuple = fresh.items.filter(
            (it) =>
              it.productId === target.productId &&
              it.productName === target.productName &&
              it.qty === target.qty &&
              it.unitPrice === target.unitPrice,
          );
          // Stable order: id POS monotonic — sort biar duplicateIndex deterministik.
          sameTuple.sort((a, b) => a.id.localeCompare(b.id));
          const dupIdx = sameTuple.findIndex((it) => it.id === itemId);
          const result = await pushVoidItemBestEffort({
            transactionId: id,
            posItem: {
              productId: target.productId,
              productName: target.productName,
              unitPrice: target.unitPrice,
              qty: target.qty,
            },
            duplicateIndex: Math.max(0, dupIdx),
            reason,
          });
          if (result === null) {
            syncStatus = "failed";
            syncError = "Backoffice unreachable atau push void gagal — cek server log.";
          } else {
            syncStatus = "ok";
          }
        }
      } catch (e) {
        syncStatus = "failed";
        syncError = e instanceof Error ? e.message : String(e);
        console.warn("[backoffice] push void item gagal:", syncError);
      }
    }

    return ok({
      ...mapFullOrder(fresh),
      sync_status: syncStatus,
      sync_error: syncError,
    });
  });
}
