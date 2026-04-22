import { asc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, ok } from "@/lib/api-server/response";

export async function GET() {
  return handle(async () => {
    const rows = await db
      .select()
      .from(schema.categories)
      .orderBy(asc(schema.categories.order));
    return ok(rows);
  });
}
