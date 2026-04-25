import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { SERVER_POS_CONFIG } from "@/lib/api-server/pos-config";
import { mapFullOrder } from "@/lib/api-server/order-mapper";

const STATUS_ORDER = ["pending", "ongoing", "serve", "done"] as const;
type Status = (typeof STATUS_ORDER)[number];

const bodySchema = z.object({
  next: z.enum(STATUS_ORDER),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  return handle(async () => {
    const user = await requireSession();
    const { id, itemId } = await ctx.params;
    const { next } = bodySchema.parse(await req.json());

    if (next === "done" && !SERVER_POS_CONFIG.itemDoneRoles.includes(user.role)) {
      throw new ApiError(403, "Hanya kasir yang dapat menandai item selesai (done).");
    }

    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!order) throw new ApiError(404, "Order tidak ditemukan");
    if (order.status === "void") throw new ApiError(409, "Order sudah di-void");

    const item = await db.query.orderItems.findFirst({
      where: eq(schema.orderItems.id, itemId),
    });
    if (!item || item.orderId !== id) throw new ApiError(404, "Item tidak ditemukan");
    // Item yang sudah di-void tidak boleh berubah status lagi (sudah "done"
    // sebagai sentinel, tapi guard eksplisit lebih jelas error message-nya).
    if (item.voidedAt) throw new ApiError(409, "Item sudah di-void");

    // Guard: hanya maju selangkah
    const curIdx = STATUS_ORDER.indexOf(item.status as Status);
    const nextIdx = STATUS_ORDER.indexOf(next);
    if (nextIdx !== curIdx + 1) {
      throw new ApiError(400, "Transisi status tidak valid");
    }

    await db.update(schema.orderItems).set({ status: next }).where(eq(schema.orderItems.id, itemId));

    const fresh = await db.query.orders.findFirst({
      where: eq(schema.orders.id, id),
      with: { items: true, payment: true },
    });
    return ok(mapFullOrder(fresh!));
  });
}
