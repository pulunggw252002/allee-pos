import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { newId } from "@/lib/api-server/ids";
import { mapFullOrder } from "@/lib/api-server/order-mapper";

const bodySchema = z.object({
  method: z.enum(["cash", "qris", "card", "transfer"]),
  tendered: z.number().int().nonnegative().optional(),
});

/**
 * Pay order. Idempoten secara defensif:
 * - Validasi state + insert payment dilakukan dalam satu transaksi.
 * - Kalau ada race (double-tap di tablet, retry karena network hiccup, dst.),
 *   constraint UNIQUE pada `order_payment.order_id` akan menolak insert kedua;
 *   kita translate jadi 409 yang bisa dipakai client untuk re-fetch order.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    await db.transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        where: eq(schema.orders.id, id),
      });
      if (!order) throw new ApiError(404, "Order tidak ditemukan");
      if (order.status === "paid") throw new ApiError(409, "Order sudah dibayar");
      if (order.status === "void") throw new ApiError(409, "Order sudah di-void");

      const tendered = body.tendered ?? order.total;
      if (body.method === "cash" && tendered < order.total) {
        throw new ApiError(400, "Uang yang diberikan kurang dari total");
      }
      const change = body.method === "cash" ? Math.max(0, tendered - order.total) : 0;
      const paidAt = new Date().toISOString();

      await tx
        .update(schema.orders)
        .set({ status: "paid", paidAt })
        .where(eq(schema.orders.id, id));

      try {
        await tx.insert(schema.orderPayments).values({
          id: newId("pay"),
          orderId: id,
          method: body.method,
          amount: order.total,
          tendered: body.method === "cash" ? tendered : null,
          change: body.method === "cash" ? change : null,
          paidAt,
        });
      } catch (e) {
        // Race / double-tap: payment row sudah ada (UNIQUE on order_id).
        // Translate ke ApiError supaya transaction rollback dan client tahu.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("constraint")) {
          throw new ApiError(409, "Order sudah dibayar");
        }
        throw e;
      }

      if (order.orderType === "dine-in" && order.tableNumber) {
        await tx
          .update(schema.tables)
          .set({ status: "empty", orderId: null })
          .where(eq(schema.tables.orderId, id));
      }
    });

    const fresh = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true, payment: true },
    });
    return ok(mapFullOrder(fresh!));
  });
}
