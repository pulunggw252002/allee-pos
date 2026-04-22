import { handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";
import { computeShiftSummary } from "@/lib/api-server/shift-summary";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSession();
    const { id } = await ctx.params;
    return ok(await computeShiftSummary(id));
  });
}
