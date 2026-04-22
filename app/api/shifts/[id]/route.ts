import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError, handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    const row = await db.query.shifts.findFirst({ where: eq(schema.shifts.id, id) });
    if (!row) throw new ApiError(404, "Shift tidak ditemukan");
    return ok(row);
  });
}
