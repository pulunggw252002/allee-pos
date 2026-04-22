import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { computeShiftSummary } from "@/lib/api-server/shift-summary";

const bodySchema = z.object({
  actualCash: z.number().int().nonnegative(),
});

async function syncShiftToBackoffice(summary: unknown) {
  // TODO: POST ke backoffice API saat endpoint tersedia.
  console.info("[backoffice-sync] shift closed", summary);
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
    await syncShiftToBackoffice(summary);
    return ok(summary);
  });
}
