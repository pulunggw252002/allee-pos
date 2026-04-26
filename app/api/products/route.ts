import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { ensureFreshSync } from "@/lib/api-server/backoffice/sync";

export async function GET() {
  return handle(async () => {
    // Stale-while-revalidate: kalau backoffice mode aktif & local catalog
    // stale, trigger sync di background. First-ever request sehabis deploy
    // di-await supaya catalog tidak kosong.
    await ensureFreshSync({ awaitFirstRun: true });
    // Filter `active = true`: produk yang sudah di-archive di backoffice
    // tetap kita pertahankan di local DB (soft-delete) supaya FK
    // `order_item.product_id` di order historis tetap resolvable. Tapi
    // mereka tidak boleh muncul di menu grid kasir.
    const rows = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.active, true));
    return ok(rows);
  });
}
