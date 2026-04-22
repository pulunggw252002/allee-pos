import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";

export async function GET() {
  return handle(async () => {
    const rows = await db.select().from(schema.tables);
    return ok(rows);
  });
}
