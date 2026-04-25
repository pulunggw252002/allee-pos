import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { computeShiftSummary } from "@/lib/api-server/shift-summary";
import { isBackofficeModeEnabled } from "@/lib/api-server/backoffice/config";
import { resolveOutletId } from "@/lib/api-server/backoffice/reads";
import { pushShiftSummaryBestEffort } from "@/lib/api-server/backoffice/writes";

const bodySchema = z.object({
  actualCash: z.number().int().nonnegative(),
});

/**
 * Push shift summary ke backoffice. Best-effort — kalau backoffice down,
 * shift tetap closed di POS local DB (kasir tidak boleh di-block).
 *
 * Sukses indicator dikembalikan ke caller supaya bisa di-surface di UI
 * ("Shift closed; rekap kas sudah masuk laporan backoffice").
 */
async function syncShiftToBackoffice(
  summary: Awaited<ReturnType<typeof computeShiftSummary>>,
): Promise<{ pushed: boolean; error?: string }> {
  if (!isBackofficeModeEnabled()) return { pushed: false };
  try {
    const outletId = await resolveOutletId();
    const result = await pushShiftSummaryBestEffort({
      id: summary.shift.id,
      outletId,
      cashierUserId: summary.shift.cashierId,
      cashierName: summary.shift.cashierName,
      openingCash: summary.shift.openingCash,
      actualCash: summary.actualCash,
      expectedCash: summary.expectedCash,
      cashDifference: summary.cashDifference,
      totalRevenue: summary.totalRevenue,
      orderCount: summary.orderCount,
      breakdown: summary.breakdown,
      note: summary.shift.note ?? null,
      openedAt: summary.shift.openedAt,
      closedAt: summary.shift.closedAt ?? new Date().toISOString(),
    });
    return { pushed: result !== null };
  } catch (e) {
    return {
      pushed: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const { actualCash } = bodySchema.parse(await req.json());

    const shift = await db.query.shifts.findFirst({ where: eq(schema.shifts.id, id) });
    if (!shift) throw new ApiError(404, "Shift tidak ditemukan");
    if (shift.closedAt) throw new ApiError(409, "Shift sudah ditutup");

    await db
      .update(schema.shifts)
      .set({ actualCash, closedAt: new Date().toISOString() })
      .where(eq(schema.shifts.id, id));

    const summary = await computeShiftSummary(id);
    const sync = await syncShiftToBackoffice(summary);
    return ok({ ...summary, sync });
  });
}
