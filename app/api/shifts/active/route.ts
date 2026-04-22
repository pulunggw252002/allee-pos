import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { requireSession } from "@/lib/api-server/session";

export async function GET() {
  return handle(async () => {
    await requireSession();
    const row = await db.query.shifts.findFirst({
      where: and(isNull(schema.shifts.closedAt)),
      orderBy: (s, { desc }) => [desc(s.openedAt)],
    });
    return ok(row ?? null);
  });
}
