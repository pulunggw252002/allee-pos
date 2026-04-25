/**
 * POST /api/backoffice/sync
 *
 * Trigger sinkron paksa catalog + users dari backoffice → DB lokal POS.
 * Hanya supervisor yang boleh memicu (sync menulis ke tabel master).
 *
 * Tipikal pemakai:
 *  - Tombol "Sync sekarang" di setting POS.
 *  - Cron / Vercel scheduled job (kalau platform support).
 *  - Manual via curl saat onboarding outlet baru.
 */

import { handle, ok, ApiError } from "@/lib/api-server/response";
import { requireRole } from "@/lib/api-server/session";
import { syncFromBackoffice } from "@/lib/api-server/backoffice/sync";
import { isBackofficeModeEnabled } from "@/lib/api-server/backoffice/config";

export async function POST() {
  return handle(async () => {
    await requireRole("supervisor");
    if (!isBackofficeModeEnabled()) {
      throw new ApiError(
        400,
        "BACKOFFICE_MODE belum aktif. Set env BACKOFFICE_MODE=true untuk mengaktifkan."
      );
    }
    const report = await syncFromBackoffice();
    return ok(report);
  });
}
