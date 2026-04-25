/**
 * GET /api/sync/queue
 *
 * Status outbox push backoffice. Dipakai banner di POS UI buat tampilin
 * "ada N transaksi belum ke-sync ke backoffice".
 *
 * Auth: any logged-in user (cashier juga butuh tahu — biar bisa lapor admin
 * kalau ada transaksi pending lama).
 */

import { handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { getOutboxStatus } from "@/lib/api-server/backoffice/outbox";

export async function GET() {
  return handle(async () => {
    await requireSession();
    return ok(await getOutboxStatus());
  });
}
