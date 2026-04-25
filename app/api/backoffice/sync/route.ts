/**
 * POST /api/backoffice/sync
 * GET  /api/backoffice/sync   ← di-pakai Vercel Cron (cron config wajib GET)
 *
 * Trigger sinkron paksa catalog + users dari backoffice → DB lokal POS.
 *
 * Auth (salah satu cocok):
 *  - Supervisor session cookie (panggilan manual dari UI/curl).
 *  - Header `Authorization: Bearer <CRON_SECRET>` — di-set otomatis oleh
 *    Vercel Cron kalau env `CRON_SECRET` ada.
 *
 * Tipikal pemakai:
 *  - Tombol "Sync sekarang" di setting POS.
 *  - Vercel Cron tiap 15 menit (lihat `vercel.json`).
 *  - Manual via curl saat onboarding outlet baru.
 */

import { headers } from "next/headers";
import { handle, ok, ApiError } from "@/lib/api-server/response";
import { requireRole } from "@/lib/api-server/session";
import { syncFromBackoffice } from "@/lib/api-server/backoffice/sync";
import { drainSyncOutbox } from "@/lib/api-server/backoffice/outbox";
import { isBackofficeModeEnabled } from "@/lib/api-server/backoffice/config";

async function authorize(): Promise<void> {
  // Path 1: cron secret (kalau di-set + cocok). Vercel Cron auto-attach
  // header Authorization: Bearer <CRON_SECRET>.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = (await headers()).get("authorization") ?? "";
    if (auth === `Bearer ${cronSecret}`) return;
  }
  // Path 2: supervisor session.
  await requireRole("supervisor");
}

async function runSync() {
  await authorize();
  if (!isBackofficeModeEnabled()) {
    throw new ApiError(
      400,
      "BACKOFFICE_MODE belum aktif. Set env BACKOFFICE_MODE=true untuk mengaktifkan."
    );
  }
  // Catalog sync dulu (categories, menus, outlet config, tax). Kalau gagal,
  // lempar — admin perlu tahu sync utama gagal.
  const report = await syncFromBackoffice();
  // Drain outbox setelah catalog up-to-date — kalau ada transaksi/void/shift
  // yang sebelumnya gagal sync (mis. backoffice down sebentar), kesempatan
  // buat nyusul. Drain TIDAK throw kalau ada yang masih gagal — kita just
  // surface count-nya di response biar admin tahu.
  let drainResult = null;
  try {
    drainResult = await drainSyncOutbox();
  } catch (e) {
    console.warn("[sync] drain outbox gagal:", e instanceof Error ? e.message : e);
  }
  return { ...report, outbox: drainResult };
}

export async function POST() {
  return handle(async () => ok(await runSync()));
}

export async function GET() {
  // Vercel Cron pakai GET. Behavior identik dengan POST.
  return handle(async () => ok(await runSync()));
}
