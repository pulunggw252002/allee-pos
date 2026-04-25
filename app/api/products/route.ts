import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { ensureFreshSync } from "@/lib/api-server/backoffice/sync";

export async function GET() {
  return handle(async () => {
    // Stale-while-revalidate: kalau backoffice mode aktif & local catalog
    // stale, trigger sync di background. First-ever request sehabis deploy
    // di-await supaya catalog tidak kosong.
    await ensureFreshSync({ awaitFirstRun: true });
    const rows = await db.select().from(schema.products);
    return ok(rows);
  });
}
