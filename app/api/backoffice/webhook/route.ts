/**
 * POST /api/backoffice/webhook
 *
 * Endpoint untuk menerima notifikasi push dari backoffice ALLEE setiap kali
 * data master berubah (menu, kategori, user, PIN POS, dll). Tujuan: POS
 * me-resync local DB dalam hitungan detik tanpa kasir kudu tekan tombol
 * "sync" manual atau menunggu cron daily.
 *
 * Auth:
 *  - Header `Authorization: Bearer <POS_WEBHOOK_SECRET>` wajib cocok dengan
 *    env yang sama di backoffice. Tanpa secret cocok → 401.
 *  - Tidak ada session check — webhook dipanggil server-to-server, bukan oleh
 *    user browser.
 *
 * Idempotency & race-handling:
 *  - Pakai `triggerSyncForWebhook` di sync.ts yang menjamin (a) hanya satu
 *    sync jalan pada satu waktu (de-dupe), (b) kalau webhook tiba selama
 *    sync, akan ada satu trailing sync lagi setelahnya supaya update yang
 *    trigger webhook ini tidak hilang.
 *
 * Response:
 *  - Selalu return cepat (sync di-fire dengan `void`, tidak di-await) supaya
 *    backoffice tidak ke-tackle latency network POS. Backoffice helper sudah
 *    fire-and-forget juga, tapi double-protection bagus.
 *  - 200 OK + `{ accepted: true }` kalau secret valid.
 *  - 401 kalau secret salah/missing.
 *  - 503 kalau BACKOFFICE_MODE off (tidak boleh sync ke backoffice yg
 *    seharusnya tidak dipakai mode standalone).
 */

import { headers } from "next/headers";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { triggerSyncForWebhook } from "@/lib/api-server/backoffice/sync";
import { isBackofficeModeEnabled } from "@/lib/api-server/backoffice/config";

interface WebhookPayload {
  ts?: string;
  entity?: string;
  event?: string;
  entity_id?: string;
  outlet_id?: string;
}

async function verifySecret(): Promise<void> {
  const secret = process.env.POS_WEBHOOK_SECRET;
  if (!secret) {
    // Tidak set → endpoint disabled. Lebih aman 503 daripada 200/401:
    // signaling ke backoffice "POS belum siap menerima webhook".
    throw new ApiError(
      503,
      "POS_WEBHOOK_SECRET belum di-set di POS. Webhook endpoint disabled.",
    );
  }
  const auth = (await headers()).get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    throw new ApiError(401, "Invalid webhook secret");
  }
}

export async function POST(req: Request) {
  return handle(async () => {
    await verifySecret();

    if (!isBackofficeModeEnabled()) {
      throw new ApiError(
        503,
        "BACKOFFICE_MODE belum aktif — POS standalone, webhook di-ignore.",
      );
    }

    // Body opsional — kita pakai untuk logging telemetry, sync-nya sendiri
    // selalu re-pull seluruh catalog (granularity per-entity belum di-implement,
    // overhead masih kecil untuk MVP). Parse defensive supaya body invalid
    // tidak crash endpoint.
    let payload: WebhookPayload = {};
    try {
      payload = (await req.json()) as WebhookPayload;
    } catch {
      // body kosong / non-JSON — abaikan
    }

    // Fire-and-forget: kita tidak menunggu sync selesai. `triggerSyncForWebhook`
    // sudah handle de-dupe + trailing-edge supaya tidak ada race.
    void triggerSyncForWebhook().catch((e) => {
      console.warn(
        `[backoffice/webhook] sync gagal untuk ${payload.entity}/${payload.event}/${payload.entity_id}:`,
        e instanceof Error ? e.message : e,
      );
    });

    return ok({
      accepted: true,
      entity: payload.entity ?? null,
      event: payload.event ?? null,
      entity_id: payload.entity_id ?? null,
      receivedAt: new Date().toISOString(),
    });
  });
}

/** GET disediakan untuk smoke-test ("apakah endpoint hidup?"). Tidak men-trigger sync. */
export async function GET() {
  return handle(async () => {
    await verifySecret();
    return ok({
      ok: true,
      enabled: isBackofficeModeEnabled(),
      now: new Date().toISOString(),
    });
  });
}
