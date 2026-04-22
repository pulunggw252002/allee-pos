import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { mapFullOrder } from "@/lib/api-server/order-mapper";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const row = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true, payment: true },
    });
    if (!row) throw new ApiError(404, "Order tidak ditemukan");
    return ok(mapFullOrder(row));
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const row = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!row) throw new ApiError(404, "Order tidak ditemukan");
    if (row.status === "paid") throw new ApiError(409, "Order sudah dibayar — tidak bisa di-void");

    await db.transaction(async (tx) => {
      await tx.update(schema.orders).set({ status: "void" }).where(eq(schema.orders.id, id));
      if (row.orderType === "dine-in" && row.tableNumber) {
        await tx
          .update(schema.tables)
          .set({ status: "empty", orderId: null })
          .where(eq(schema.tables.orderId, id));
      }
    });

    return ok({ ok: true });
  });
}
