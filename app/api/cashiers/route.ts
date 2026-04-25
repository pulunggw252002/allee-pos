import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";
import { ensureFreshSync } from "@/lib/api-server/backoffice/sync";

export async function GET() {
  return handle(async () => {
    await ensureFreshSync({ awaitFirstRun: true });
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        role: schema.users.role,
      })
      .from(schema.users);
    return ok(rows);
  });
}
