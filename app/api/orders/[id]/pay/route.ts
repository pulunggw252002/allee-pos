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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!order) throw new ApiError(404, "Order tidak ditemukan");
    if (order.status === "paid") throw new ApiError(409, "Order sudah dibayar");
    if (order.status === "void") throw new ApiError(409, "Order sudah di-void");

    const tendered = body.tendered ?? order.total;
    if (body.method === "cash" && tendered < order.total) {
      throw new ApiError(400, "Uang yang diberikan kurang dari total");
    }
    const change = body.method === "cash" ? Math.max(0, tendered - order.total) : 0;
    const paidAt = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx
        .update(schema.orders)
        .set({ status: "paid", paidAt })
        .where(eq(schema.orders.id, id));

      await tx.insert(schema.orderPayments).values({
        id: newId("pay"),
        orderId: id,
        method: body.method,
        amount: order.total,
        tendered: body.method === "cash" ? tendered : null,
        change: body.method === "cash" ? change : null,
        paidAt,
      });

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
