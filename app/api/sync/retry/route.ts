/**
 * POST /api/sync/retry
 *
 * Drain semua entry di sync_outbox — re-try push backoffice yang sebelumnya
 * gagal. Dipakai dari banner POS UI ("Coba sync lagi") atau cron.
 *
 * Auth: supervisor only — drain bisa generate banyak request ke backoffice,
 * jadi cegah kasir spam.
 *
 * Idempotent — backoffice POST /api/transactions, void, dan pos-shifts
 * semuanya dedup by id, jadi re-call aman walaupun row outbox sebenarnya
 * sudah ke-sync (race condition double-retry).
 */

import { handle, ok } from "@/lib/api-server/response";
import { requireRole } from "@/lib/api-server/session";
import { drainSyncOutbox } from "@/lib/api-server/backoffice/outbox";
import { isBackofficeModeEnabled } from "@/lib/api-server/backoffice/config";
import { ApiError } from "@/lib/api-server/response";

export async function POST() {
  return handle(async () => {
    await requireRole("supervisor");
    if (!isBackofficeModeEnabled()) {
      throw new ApiError(400, "BACKOFFICE_MODE belum aktif — outbox tidak relevan.");
    }
    const result = await drainSyncOutbox();
    return ok(result);
  });
}
