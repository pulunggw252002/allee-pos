import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { ensureFreshSync } from "@/lib/api-server/backoffice/sync";
import { resolveOutletIdLocal } from "@/lib/api-server/runtime-config";

/**
 * GET /api/printers — list printer aktif untuk outlet POS ini.
 *
 * Dipakai oleh `/settings` page supaya kasir bisa pilih 2 printer
 * (1 receipt + 1 kitchen). Hanya yang `active = true` yang di-return —
 * non-aktif tetap di local DB untuk resolusi histori, tapi tidak muncul
 * di picker.
 *
 * Auto stale-while-revalidate sync seperti endpoint master data lain
 * supaya owner tambah printer di backoffice langsung kepick di POS
 * tanpa kasir manual sync.
 */
export async function GET() {
  return handle(async () => {
    await ensureFreshSync({ awaitFirstRun: true });
    const outletId = await resolveOutletIdLocal();
    const rows = await db
      .select()
      .from(schema.printers)
      .where(eq(schema.printers.outletId, outletId));
    // Return hanya yang aktif — tapi tetap include non-aktif kalau owner
    // mau lihat full list lewat query `?include_inactive=1`. MVP: aktif saja.
    return ok(rows.filter((p) => p.active));
  });
}
