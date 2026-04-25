import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { ensureFreshSync } from "@/lib/api-server/backoffice/sync";

export async function GET() {
  return handle(async () => {
    await ensureFreshSync({ awaitFirstRun: true });
    const rows = await db
      .select()
      .from(schema.categories)
      .orderBy(asc(schema.categories.order));
    return ok(rows);
  });
}
