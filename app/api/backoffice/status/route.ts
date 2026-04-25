/**
 * GET /api/backoffice/status
 *
 * Health check integrasi: laporkan apakah BACKOFFICE_MODE aktif, apakah
 * config valid, dan apakah local catalog sudah ter-sync. Bisa di-pakai UI
 * settings untuk nampilkan banner "POS belum sinkron".
 */

import { handle, ok } from "@/lib/api-server/response";
import {
  isBackofficeModeEnabled,
  readBackofficeConfig,
} from "@/lib/api-server/backoffice/config";
import { isLocalCatalogSynced } from "@/lib/api-server/backoffice/sync";

export async function GET() {
  return handle(async () => {
    const enabled = isBackofficeModeEnabled();
    if (!enabled) {
      return ok({
        mode: "standalone" as const,
        enabled: false,
        configured: false,
        synced: true, // standalone: catalog lokal selalu valid
      });
    }

    let configured = false;
    let configError: string | null = null;
    let outletId: string | null = null;
    try {
      const cfg = readBackofficeConfig();
      configured = true;
      outletId = cfg.outletIdOverride;
    } catch (e) {
      configError = e instanceof Error ? e.message : String(e);
    }

    const synced = configured ? await isLocalCatalogSynced() : false;

    return ok({
      mode: "backoffice" as const,
      enabled: true,
      configured,
      configError,
      outletId,
      synced,
    });
  });
}
