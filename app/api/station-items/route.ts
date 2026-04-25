import { ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { mapFullOrder } from "@/lib/api-server/order-mapper";

export async function GET() {
  return handle(async () => {
    await requireSession();
    const orders = await db.query.orders.findMany({
      where: ne(schema.orders.status, "void"),
      with: { items: true, payment: true },
    });
    const rows: Array<{ order: ReturnType<typeof mapFullOrder>; item: ReturnType<typeof mapFullOrder>["items"][number] }> = [];
    for (const o of orders) {
      const mapped = mapFullOrder(o);
      for (const it of mapped.items) {
        if (it.status === "done") continue;
        // Skip item yang sudah di-void per item — tidak perlu dimasak ulang.
        if (it.voidedAt) continue;
        rows.push({ order: mapped, item: it });
      }
    }
    return ok(rows);
  });
}
